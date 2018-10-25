const BaseAccessory = require('./BaseAccessory');

class OutletAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.OUTLET;
    }

    constructor(...props) {
        super(...props);
    }

    _instrument() {
        const {Service, Characteristic} = this.hap;
        const device = this.tuya.device;

        const service = this.accessory.addService(Service.Outlet, device.name);

        // Add any Characteristic

        super._instrument();
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