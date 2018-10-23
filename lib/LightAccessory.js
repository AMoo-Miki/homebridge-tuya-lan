const BaseAccessory = require('./BaseAccessory');

class LightAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.LIGHTBULB;
    }

    constructor(...props) {
        super(...props);
    }

    _instrument() {
        const Service = this.hap.Service.Lightbulb;
        const device = this.tuya.device;

        this.accessory.addService(Service, device.name);

        // Add any Characteristic

        super._instrument();
    }

    _addEventHandlers(dps) {
        const Service = this.hap.Service.Lightbulb;

        this._addEventHandler(Service, Characteristic.On, dps['1']);
    }

    _addEventHandler(service, characteristic, initialValue) {
        switch (characteristic) {
            case Characteristic.On:
                service.getCharacteristic(Characteristic.On)
                    .setValue(initialValue)
                    .on('get', this.getPower.bind(this))
                    .on('set', this.setPower.bind(this));
                break;
        }
    }

    getPower(callback) {
        this.getState('1', callback);
    }

    setPower(value, callback) {
        this.setState('1', value, callback);
    }
}

module.exports = LightAccessory;