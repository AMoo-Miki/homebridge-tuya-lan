const BaseAccessory = require('./BaseAccessory');

class LightAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.LIGHTBULB;
    }

    constructor(...props) {
        super(...props);
    }

    _instrument() {
        const {Service, Characteristic} = this.hap;
        const device = this.tuya.device;
        this.lod.debug('Instrumenting', device.name);

        const service = this.accessory.addService(Service.Lightbulb, device.name);

        // Add any Characteristic

        super._instrument();
    }

    _addEventHandlers(dps) {
        this.lod.debug('Adding handlers for', this.tuya.device.name);
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.Lightbulb);

        service.getCharacteristic(Characteristic.On)
            .setValue(dps['1'])
            .on('get', this.getState.bind(this, '1'))
            .on('set', this.setState.bind(this, '1'));
    }
}

module.exports = LightAccessory;