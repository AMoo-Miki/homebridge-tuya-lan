const BaseAccessory = require('./BaseAccessory');

class OutletAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.OUTLET;
    }

    constructor(...props) {
        super(...props);
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.Outlet, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic, EnergyCharacteristics} = this.hap;
        const service = this.accessory.getService(Service.Outlet);
        this._checkServiceName(service, this.device.context.name);

        const energyKeys = {
            volts: (parseInt(this.device.context.voltsId) || '').toString(),
            voltsDivisor: parseInt(this.device.context.voltsDivisor) || 10,
            amps: (parseInt(this.device.context.ampsId) || '').toString(),
            ampsDivisor: parseInt(this.device.context.ampsDivisor) || 1000,
            watts: (parseInt(this.device.context.wattsId) || '').toString(),
            wattsDivisor: parseInt(this.device.context.wattsDivisor) || 10
        };

        let characteristicVolts;
        if (energyKeys.volts) {
            characteristicVolts = service.getCharacteristic(EnergyCharacteristics.Volts)
                .updateValue(this._getDividedState(dps[energyKeys.volts], energyKeys.voltsDivisor))
                .on('get', this.getDividedState.bind(this, energyKeys.volts, energyKeys.voltsDivisor));
        } else this._removeCharacteristic(service, EnergyCharacteristics.Volts);

        let characteristicAmps;
        if (energyKeys.amps) {
            characteristicAmps = service.getCharacteristic(EnergyCharacteristics.Amperes)
                .updateValue(this._getDividedState(dps[energyKeys.amps], energyKeys.ampsDivisor))
                .on('get', this.getDividedState.bind(this, energyKeys.amps, energyKeys.ampsDivisor));
        } else this._removeCharacteristic(service, EnergyCharacteristics.Amperes);

        let characteristicWatts;
        if (energyKeys.watts) {
            characteristicWatts = service.getCharacteristic(EnergyCharacteristics.Watts)
                .updateValue(this._getDividedState(dps[energyKeys.watts], energyKeys.wattsDivisor))
                .on('get', this.getDividedState.bind(this, energyKeys.watts, energyKeys.wattsDivisor));
        } else this._removeCharacteristic(service, EnergyCharacteristics.Watts);
        
        const characteristicOn = service.getCharacteristic(Characteristic.On)
            .updateValue(dps['1'])
            .on('get', this.getState.bind(this, '1'))
            .on('set', this.setState.bind(this, '1'));

        this.device.on('change', changes => {
            if (changes.hasOwnProperty('1') && characteristicOn.value !== changes['1']) characteristicOn.updateValue(changes['1']);
            
            if (changes.hasOwnProperty(energyKeys.volts) && characteristicVolts) {
                const newVolts = this._getDividedState(changes[energyKeys.volts], energyKeys.voltsDivisor);
                if (characteristicVolts.value !== newVolts) characteristicVolts.updateValue(newVolts);
            }

            if (changes.hasOwnProperty(energyKeys.amps) && characteristicAmps) {
                const newAmps = this._getDividedState(changes[energyKeys.amps], energyKeys.ampsDivisor);
                if (characteristicAmps.value !== newAmps) characteristicAmps.updateValue(newAmps);
            }

            if (changes.hasOwnProperty(energyKeys.watts) && characteristicWatts) {
                const newWatts = this._getDividedState(changes[energyKeys.watts], energyKeys.wattsDivisor);
                if (characteristicWatts.value !== newWatts) characteristicWatts.updateValue(newWatts);
            }
        });
    }
}

module.exports = OutletAccessory;