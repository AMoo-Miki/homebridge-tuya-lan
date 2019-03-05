const BaseAccessory = require('./BaseAccessory');

class DimmerLightAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.LIGHTBULB;
    }

    constructor(...props) {
        super(...props);
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.Lightbulb, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.Lightbulb);

        const characteristicOn = service.getCharacteristic(Characteristic.On)
            .updateValue(dps['1'])
            .on('get', this.getState.bind(this, '1'))
            .on('set', this.setState.bind(this, '1'));

        const characteristicBrightness = service.getCharacteristic(Characteristic.Brightness)
            .updateValue(dps['2'])
            .on('get', this.getBrightness.bind(this))
            .on('set', this.setBrightness.bind(this));

        this.device.on('change', changes => {
            if (changes.hasOwnProperty('1') && characteristicOn.value !== changes['1']) characteristicOn.updateValue(changes['1']);
        });
    }

    getBrightness(callback) {
        callback(null, this.convertBrightnessFromTuyaToHomeKit(this.device.state['2']));
    }

    setBrightness(value, callback) {
        this.setState('2', this.convertBrightnessFromHomeKitToTuya(value), callback);
    }
}

module.exports = DimmerLightAccessory;