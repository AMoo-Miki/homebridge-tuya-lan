class BaseAccessory {
    constructor(...props) {
        let isNew;
        [this.platform, this.accessory, this.tuya, isNew = true] = [...props];
        ({log: this.log, api: {hap: this.hap}} = this.platform);
        this._cache = {};
        this._callbacks = [];

        if (isNew) this._instrument();

        this.accessory.on('identify', function(paired, callback) {
            this.log("%s - identify", this.tuya.device.name);
            callback();
        }.bind(this));

        const self = this;
        this._update(() => {
            self._addEventHandlers(self._cache.dps);
        });
    }

    _instrument() {
        this.platform.registerPlatformAccessories(this.accessory);
    }

    _update(callback) {
        if (this._cache.busy) return this._callbacks.push(callback);

        this._cache.busy = true;

        const self = this;
        this.tuya.get({schema: true})
            .then(schema => {
                self._cache.dps = schema.dps;
                self._cache.time = Date.now();
            })
            .catch(err => {
                self.log('Failed to update [%s]', self.tuya.device.name);
                self.log(err);
            })
            .then(() => {
                self._cache.busy = false;
                while (self._callbacks.length > 0) {
                    self._callbacks.pop()();
                }
            });
    }

    getState(dp, callback) {
        const self = this;
        const _callback = () => {
            if (Array.isArray(dp)) {
                const ret = {};
                dp.forEach(p => {
                    ret[p] = self._cache.dps[p];
                });
                callback(null, ret);
            } else {
                callback(null, self._cache.dps[dp]);
            }
        };

        if (Date.now() - self._cache < 1000) return process.nextTick(_callback);
        this._update(_callback);
    }

    setState(dp, value, callback) {
        const self = this;
        this.tuya.set({dps: dp, set: value})
            .then(schema => {
                self._cache.dps = schema.dps;
                self._cache.time = Date.now();
            })
            .catch(err => {
                self.log('Failed to update [%s]', self.tuya.device.name);
                self.log(err);
            })
            .then(() => {
                callback();
            });
    }

    getBrightnessForTuya(value) {
        const min = this.tuya.device.minValue || 27;
        return Math.round(((255 - min) * value + 100 * min - 255) / 99);
    }

    getBrightnessFromTuya(value) {
        const min = this.tuya.device.minValue || 27;
        return Math.round((99 * value - 100 * min + 255) / (255 - min));
    }

    getColorTemperatureForTuya(value) {
        return Math.round((value - 140) * 14 / 24);
    }

    getColorTemperatureFromTuya(value) {
        return Math.round((24 * value / 17) + 140);
    }

    getColorForTuya(value) {
        const cached = this.getColorFromTuya(this._cache.dps['5']);
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