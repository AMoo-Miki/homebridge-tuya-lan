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
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.Outlet);

        const characteristicOn = service.getCharacteristic(Characteristic.On)
            .updateValue(dps['1'])
            .on('get', this.getState.bind(this, '1'))
            .on('set', this.setState.bind(this, '1'));

        this.device.on('change', changes => {
            if (changes.hasOwnProperty('1') && characteristicOn.value !== changes['1']) characteristicOn.updateValue(changes['1']);
        });
    }
}

module.exports = OutletAccessory;