const BaseAccessory = require('./BaseAccessory');
const async = require('async');

class RGBTWLightAccessory extends BaseAccessory {
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
        this._checkServiceName(service, this.device.context.name);

        const characteristicOn = service.getCharacteristic(Characteristic.On)
            .updateValue(dps['1'])
            .on('get', this.getState.bind(this, '1'))
            .on('set', this.setState.bind(this, '1'));

        const characteristicBrightness = service.getCharacteristic(Characteristic.Brightness)
            .updateValue(dps['2'] === 'white' ? this.convertBrightnessFromTuyaToHomeKit(dps['3']) : this.convertColorFromTuyaToHomeKit(dps['5']).b)
            .on('get', this.getBrightness.bind(this))
            .on('set', this.setBrightness.bind(this));

        const characteristicColorTemperature = service.getCharacteristic(Characteristic.ColorTemperature)
            .setProps({
                minValue: 0,
                maxValue: 600
            })
            .updateValue(dps['2'] === 'white' ? this.convertColorTemperatureFromTuyaToHomeKit(dps['4']) : 0)
            .on('get', this.getColorTemperature.bind(this))
            .on('set', this.setColorTemperature.bind(this));

        const characteristicHue = service.getCharacteristic(Characteristic.Hue)
            .updateValue(dps['2'] === 'white' ? 0 : this.convertColorFromTuyaToHomeKit(dps['5']).h)
            .on('get', this.getHue.bind(this))
            .on('set', this.setHue.bind(this));

        const characteristicSaturation = service.getCharacteristic(Characteristic.Saturation)
            .updateValue(dps['2'] === 'white' ? 0 : this.convertColorFromTuyaToHomeKit(dps['5']).s)
            .on('get', this.getSaturation.bind(this))
            .on('set', this.setSaturation.bind(this));

        this.characteristicHue = characteristicHue;
        this.characteristicSaturation = characteristicSaturation;
        this.characteristicColorTemperature = characteristicColorTemperature;

        this.device.on('change', (changes, state) => {
            if (changes.hasOwnProperty('1') && characteristicOn.value !== changes['1']) characteristicOn.updateValue(changes['1']);

            switch (state['2']) {
                case 'white':
                    if (changes.hasOwnProperty('3') && this.convertBrightnessFromHomeKitToTuya(characteristicBrightness.value) !== changes['3'])
                        characteristicBrightness.updateValue(this.convertBrightnessFromTuyaToHomeKit(changes['3']));

                    if (changes.hasOwnProperty('4') && this.convertColorTemperatureFromHomeKitToTuya(characteristicColorTemperature.value) !== changes['4']) {

                        const newColorTemperature = this.convertColorTemperatureFromTuyaToHomeKit(changes['4']);
                        const newColor = this.convertHomeKitColorTemperatureToHomeKitColor(newColorTemperature);

                        characteristicHue.updateValue(newColor.h);
                        characteristicSaturation.updateValue(newColor.s);
                        characteristicColorTemperature.updateValue(newColorTemperature);

                    } else if (changes['2'] && !changes.hasOwnProperty('4')) {

                        const newColorTemperature = this.convertColorTemperatureFromTuyaToHomeKit(state['4']);
                        const newColor = this.convertHomeKitColorTemperatureToHomeKitColor(newColorTemperature);

                        characteristicHue.updateValue(newColor.h);
                        characteristicSaturation.updateValue(newColor.s);
                        characteristicColorTemperature.updateValue(newColorTemperature);
                    }

                    break;

                default:
                    if (changes.hasOwnProperty('5')) {
                        const oldColor = this.convertColorFromTuyaToHomeKit(this.convertColorFromHomeKitToTuya({
                            h: characteristicHue.value,
                            s: characteristicSaturation.value,
                            b: characteristicBrightness.value
                        }));
                        const newColor = this.convertColorFromTuyaToHomeKit(changes['5']);

                        if (oldColor.b !== newColor.b) characteristicBrightness.updateValue(newColor.b);
                        if (oldColor.h !== newColor.h) characteristicHue.updateValue(newColor.h);

                        if (oldColor.s !== newColor.s) characteristicSaturation.updateValue(newColor.h);

                        if (characteristicColorTemperature.value !== 0) characteristicColorTemperature.updateValue(0);

                    } else if (changes['2']) {
                        if (characteristicColorTemperature.value !== 0) characteristicColorTemperature.updateValue(0);
                    }
            }
        });
    }

    getBrightness(callback) {
        if (this.device.state['2'] === 'white') return callback(null, this.convertBrightnessFromTuyaToHomeKit(this.device.state['3']));
        callback(null, this.convertColorFromTuyaToHomeKit(this.device.state['5']).b);
    }

    setBrightness(value, callback) {
        if (this.device.state['2'] === 'white') return this.setState('3', this.convertBrightnessFromHomeKitToTuya(value), callback);
        this.setState('5', this.convertColorFromHomeKitToTuya({b: value}), callback);
    }

    getColorTemperature(callback) {
        if (this.device.state['2'] !== 'white') return callback(null, 0);
        callback(null, this.convertColorTemperatureFromTuyaToHomeKit(this.device.state['4']));
    }

    setColorTemperature(value, callback) {
        if (value === 0) return callback(null, true);

        const newColor = this.convertHomeKitColorTemperatureToHomeKitColor(value);
        this.characteristicHue.updateValue(newColor.h);
        this.characteristicSaturation.updateValue(newColor.s);

        this.setMultiState({'2': 'white', '4': this.convertColorTemperatureFromHomeKitToTuya(value)}, callback);
    }

    getHue(callback) {
        if (this.device.state['2'] === 'white') return callback(null, 0);
        callback(null, this.convertColorFromTuyaToHomeKit(this.device.state['5']).h);
    }

    setHue(value, callback) {
        this._setHueSaturation({h: value}, callback);
    }

    getSaturation(callback) {
        if (this.device.state['2'] === 'white') return callback(null, 0);
        callback(null, this.convertColorFromTuyaToHomeKit(this.device.state['5']).s);
    }

    setSaturation(value, callback) {
        this._setHueSaturation({s: value}, callback);
    }

    _setHueSaturation(prop, callback) {
        if (!this._pendingHueSaturation) {
            this._pendingHueSaturation = {props: {}, callbacks: []};
        }

        if (prop) {
            if (this._pendingHueSaturation.timer) clearTimeout(this._pendingHueSaturation.timer);

            this._pendingHueSaturation.props = {...this._pendingHueSaturation.props, ...prop};
            this._pendingHueSaturation.callbacks.push(callback);

            this._pendingHueSaturation.timer = setTimeout(() => {
                this._setHueSaturation();
            }, 500);
            return;
        }

        //this.characteristicColorTemperature.updateValue(0);

        const callbacks = this._pendingHueSaturation.callbacks;
        const callEachBack = err => {
            async.eachSeries(callbacks, (callback, next) => {
                try {
                    callback(err);
                } catch (ex) {}
                next();
            }, () => {
                this.characteristicColorTemperature.updateValue(0);
            });
        };

        const isSham = this._pendingHueSaturation.props.h === 0 && this._pendingHueSaturation.props.s === 0;
        const newValue = this.convertColorFromHomeKitToTuya(this._pendingHueSaturation.props);
        this._pendingHueSaturation = null;


        if (this.device.state['2'] === 'white' && isSham) return callEachBack();

        this.setMultiState({'2': 'colour', '5': newValue}, callEachBack);
    }
}

module.exports = RGBTWLightAccessory;