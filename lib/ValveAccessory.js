const BaseAccessory = require('./BaseAccessory');

class SprinklerAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.FAUCET;
    }

    constructor(...props) {
        super(...props);
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.Valve, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic, EnergyCharacteristics} = this.hap;
        const service = this.accessory.getService(Service.Valve);
        this._checkServiceName(service, this.device.context.name);
        this.noTimer = this.device.context.noTimer
        this.lastActivationTime = null

        service.timer = null;
        
        switch (this.device.context.type) {
            case 'GENERIC_VALVE':
                service.getCharacteristic(Characteristic.ValveType).updateValue(0);
                break;
            case 'SHOWER_HEAD':
                service.getCharacteristic(Characteristic.ValveType).updateValue(2);
                break;
            case 'WATER_FAUCET':
                service.getCharacteristic(Characteristic.ValveType).updateValue(3);
                break;
            default:
                service.getCharacteristic(Characteristic.ValveType).updateValue(1);
                break;
        }

        this.dpPower = this._getCustomDP(this.device.context.dpPower) || '1';
            
        const characteristicActive = service.getCharacteristic(Characteristic.Active)
            .updateValue(dps[this.dpPower])
            .on('get', this.getState.bind(this, this.dpPower))
            .on('set', this.setState.bind(this, this.dpPower));

            const characteristicInUse = service.getCharacteristic(Characteristic.InUse)
            .on('get', this.getState.bind(this, this.dpPower))


            if (!this.noTimer) {
				const characteristicSetDuration = service.addCharacteristic(Characteristic.SetDuration)
					.on('change', (data)=> {
                        console.log("Valve Time Duration Set to: " + data.newValue + " seconds")
                        if(service.getCharacteristic(Characteristic.InUse).value) {
                            service.getCharacteristic(Characteristic.RemainingDuration)
                                .updateValue(data.newValue);
                                
                            clearTimeout(service.timer); // clear any existing timer
                            this.lastActivationTime = (new Date()).getTime();
                            service.timer = setTimeout( ()=> {
                                console.log("Valve Timer Expired. Shutting off Valve");
                                // use 'setvalue' when the timer ends so it triggers the .on('set'...) event
                                service.getCharacteristic(Characteristic.Active).setValue(0); 
                                this.lastActivationTime = null;
                            }, (data.newValue *1000));	
                        }
                    }); // end .on('change' ...

                const characteristicRemainingDuration = service.addCharacteristic(Characteristic.RemainingDuration)
                    .on('get', (next) => { next(null, ((new Date()).getTime() - this.lastActivationTime) * 1000 )})
					.on('change', (data) => { console.log("Valve Remaining Duration changed to: " + data.newValue) });

				service.getCharacteristic(Characteristic.InUse)
					.on('change', (data) => {
							switch(data.newValue) {
								case 0:
									service.getCharacteristic(Characteristic.RemainingDuration).updateValue(0);
                                    clearTimeout(service.timer); // clear the timer if it was used!
                                    this.lastActivationTime = null
									break;
								case 1:
									var timer = service.getCharacteristic(Characteristic.SetDuration).value;
									
									service.getCharacteristic(Characteristic.RemainingDuration)
										.updateValue(timer);
									
									console.log("Turning Valve on with Timer set to: "+  timer + " seconds");									
									service.timer = setTimeout( ()=> {
                                            console.log("Valve Timer Expired. Shutting off Valve");
                                            // use 'setvalue' when the timer ends so it triggers the .on('set'...) event
                                            service.getCharacteristic(Characteristic.Active).setValue(0); 
                                    }, (timer *1000));
									break;
							}
						}); // end .on('change' ...
			} // end if(!this.noTimer)



        this.device.on('change', changes => {
            if (changes.hasOwnProperty(this.dpPower) && characteristicActive.value !== changes[this.dpPower]) characteristicActive.updateValue(changes[this.dpPower]);
            if (changes.hasOwnProperty(this.dpPower) && characteristicInUse.value !== changes[this.dpPower]) characteristicInUse.setValue(changes[this.dpPower]);
            
            if (!this.noTimer) {
                if (changes.hasOwnProperty(this.dpPower) && !changes[this.dpPower]){
                    clearTimeout(service.timer);
                    service.getCharacteristic(Characteristic.RemainingDuration).updateValue(0);
                }
            }
        });
    }
}

module.exports = SprinklerAccessory;