class BaseAccessory {
    constructor(...props) {
        let isNew;
        [this.platform, this.accessory, this.device, isNew = true] = [...props];
        ({log: this.log, api: {hap: this.hap}} = this.platform);

        this.log(this.device.context.name, isNew ? 'is new' : 'is old');

        if (isNew) this._instrument();

        this.accessory.on('identify', function(paired, callback) {
            this.log("%s - identify", this.device.context.name);
            callback();
        }.bind(this));

        this.device.once('change', () => {
            this.log('Ready to handle', this.device.context.name);
            this._addEventHandlers(this.device.state);
        });
    }

    _instrument() {
        this.platform.registerPlatformAccessories(this.accessory);
    }

    getState(dp, callback) {
        this.log('Getting status for', dp);
        const _callback = () => {
            if (Array.isArray(dp)) {
                const ret = {};
                dp.forEach(p => {
                    ret[p] = this.device.state[p];
                });
                callback(null, ret);
            } else {
                callback(null, this.device.state[dp]);
            }
        };

        process.nextTick(_callback);
    }

    setState(dp, value, callback) {
        this.log('Setting status for', dp, value);
        this.setMultiState({[dp.toString()]: value}, callback);
    }

    setMultiState(dps, callback) {
        this.log('Setting status for', dps);
        const ret = this.device.update(dps);

        process.nextTick(() => {
            callback(!ret);
        });
    }

    getBrightnessForTuya(value) {
        const min = this.device.context.minValue || 27;
        return Math.round(((255 - min) * value + 100 * min - 255) / 99);
    }

    getBrightnessFromTuya(value) {
        const min = this.device.context.minValue || 27;
        return Math.round((99 * value - 100 * min + 255) / (255 - min));
    }

    getColorTemperatureForTuya(value) {
        return Math.round((value - 140) * 14 / 24);
    }

    getColorTemperatureFromTuya(value) {
        return Math.round((24 * value / 17) + 140);
    }

    getColorForTuya(value, dpValue) {
        const cached = this.getColorFromTuya(dpValue || this.device.state['5']);
        let {h, s, b} = {...cached, ...value};
        const hsb = ('000' + h.toString(16)).substr(-4) + ('0' + s.toString(16)).substr(-2) + ('0' + b.toString(16)).substr(-2);
        h /= 60;
        s /= 100;
        b *= 2.55;

        const
            i = Math.floor(h),
            f = h - i,
            p = b * (1 - s),
            q = b * (1 - s * f),
            t = b * (1 - s * (1 - f)),
            rgb = (() => {
                switch (i % 6) {
                    case 0:
                        return [b, t, p];
                    case 1:
                        return [q, b, p];
                    case 2:
                        return [p, b, t];
                    case 3:
                        return [p, q, b];
                    case 4:
                        return [t, p, b];
                    case 5:
                        return [b, p, q];
                }
            })().map(c => Math.round(c).toString(16)),
            hex = ('000' + rgb.join('')).substr(-6);

        return hex + hsb;
    }

    getColorFromTuya(value) {
        const [, , h, s, b] = value.match(/^([0-9a-f]{6})([0-9a-f]{4})([0-9a-f]{2})([0-9a-f]{2})$/i);
        return {
            h: parseInt(h, 16),
            s: parseInt(s, 16),
            b: parseInt(b, 16)
        };
    }
}

module.exports = BaseAccessory;