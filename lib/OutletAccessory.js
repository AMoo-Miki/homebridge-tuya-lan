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

    _addEventHandlers(dps) {
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.Outlet);

        service.getCharacteristic(Characteristic.On)
            .setValue(dps['1'])
            .on('get', this.getState.bind(this, '1'))
            .on('set', this.setState.bind(this, '1'));
    }
}

module.exports = OutletAccessory;