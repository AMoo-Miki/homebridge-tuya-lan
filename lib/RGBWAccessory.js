const BaseAccessory = require('./BaseAccessory');
const async = require('async');

class RGBWAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.LIGHTBULB;
    }

    constructor(...props) {
        super(...props);
    }

    _instrument() {
        const {Service, Characteristic} = this.hap;
        const device = this.tuya.device;

        const service = this.accessory.addService(Service.Lightbulb, device.name);
        // Add any Characteristic
        service.addCharacteristic(new Characteristic.Hue());
        service.addCharacteristic(new Characteristic.Saturation());
        service.addCharacteristic(new Characteristic.Brightness());
        service.addCharacteristic(new Characteristic.ColorTemperature());

        super._instrument();
    }

    _addEventHandlers(dps) {
        const {Characteristic} = this.hap;
        const service = this.accessory.getService(this.hap.Service.Lightbulb);

        service.getCharacteristic(Characteristic.On)
            .setValue(dps['1'])
            .on('get', this.getState.bind(this, '1'))
            .on('set', this.setState.bind(this, '1'));

        service.getCharacteristic(Characteristic.Brightness)
            .setValue(dps['2'] === 'white' ? this.getBrightnessFromTuya(dps['3']) : this.getColorFromTuya(dps['5']).b)
            .on('get', this.getBrightness.bind(this))
            .on('set', this.setBrightness.bind(this));

        service.getCharacteristic(Characteristic.ColorTemperature)
            .setValue(this.getColorTemperatureFromTuya(dps['4']))
            .on('get', this.getColorTemperature.bind(this))
            .on('set', this.setColorTemperature.bind(this));

        service.getCharacteristic(Characteristic.Hue)
            .setValue(this.getColorFromTuya(dps['5']).h)
            .on('get', this.getHue.bind(this))
            .on('set', this.setHue.bind(this));

        service.getCharacteristic(Characteristic.Saturation)
            .setValue(this.getColorFromTuya(dps['5']).s)
            .on('get', this.getSaturation.bind(this))
            .on('set', this.setSaturation.bind(this));
    }

    getBrightness(callback) {
        this.log.debug('getBrightness');
        const self = this;
        this.getState(['2', '3', '5'], (err, value) => {
            if (err) return callback(err);
            if (value['2'] === 'white') return callback(null, self.getBrightnessFromTuya(value['3']));
            callback(null, self.getColorFromTuya(value['5']).b)
        });
    }

    setBrightness(value, callback) {
        const self = this;
        this.getState(['2', '3', '5'], (err, value) => {
            if (err) return callback(err);
            if (value['2'] === 'white') return self.setState('3', self.getBrightnessForTuya(value), callback);
            self.setState('5', self.getColorForTuya({b: value}), callback);
        });
    }

    getColorTemperature(callback) {
        this.log.debug('getColorTemperature');
        const self = this;
        this.getState('4', (err, value) => {
            if (err) return callback(err);
            const newValue = self.getColorTemperatureFromTuya(value);
            callback(null, newValue);
        });
    }

    setColorTemperature(value, callback) {
        const self = this;
        const newValue = this.getColorTemperatureForTuya(value);

        async.series([
            (next) => {
                self.setState('2', 'white', next);
            },
            (next) => {
                self.setState('4', newValue, next);
            }
        ], callback);
    }

    getHue(callback) {
        this.log.debug('getHue');
        const self = this;
        this.getState('5', (err, value) => {
            if (err) return callback(err);
            const newValue = self.getColorFromTuya(value).h;
            callback(null, newValue);
        });
    }

    setHue(value, callback) {
        this._setHueSaturation({h: value}, callback);
    }

    getSaturation(callback) {
        this.log.debug('getSaturation');
        const self = this;
        this.getState('5', (err, value) => {
            if (err) return callback(err);
            const newValue = self.getColorFromTuya(value).s;
            callback(null, newValue);
        });
    }

    setSaturation(value, callback) {
        this._setHueSaturation({s: value}, callback);
    }

    _setHueSaturation(prop, callback) {
        const self = this;
        if (!this._pendingHueSaturation) {
            this._pendingHueSaturation = {props: {}, callbacks: []};
        }

        if (prop) {
            if (this._pendingHueSaturation.timer) clearTimeout(this._pendingHueSaturation.timer);

            this._pendingHueSaturation.props = {...this._pendingHueSaturation, ...props};
            this._pendingHueSaturation.callbacks.push(callback);

            this._pendingHueSaturation.timer = setTimeout(() => {
                self._setHueSaturation();
            }, 500);
            return;
        }

        const callbacks = this._pendingHueSaturation.callbacks;
        const newValue = this.getColorForTuya(this._pendingHueSaturation.props);
        this._pendingHueSaturation = null;

        async.series([
            (next) => {
                self.setState('2', 'colour', next);
            },
            (next) => {
                self.setState('5', newValue, next);
            }
        ], err => {
            callbacks.forEach(callback => {
                callback(err);
            })
        });
    }
}

// 5 saturation brightness

module.exports = RGBWAccessory;