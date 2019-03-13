const BaseAccessory = require('./BaseAccessory');

class SimpleLightAccessory extends BaseAccessory {
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

        this.device.on('change', changes => {
            if (changes.hasOwnProperty('1') && characteristicOn.value !== changes['1']) characteristicOn.updateValue(changes['1']);
            console.log('[TuyaAccessory] SimpleLight changed: ' + JSON.stringify(state));
        });
    }
}

module.exports = SimpleLightAccessory;