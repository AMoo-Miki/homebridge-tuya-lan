class BaseAccessory {
    constructor(...props) {
        let isNew;
        [this.platform, this.accessory, this.device, isNew = true] = [...props];
        ({log: this.log, api: {hap: this.hap}} = this.platform);

        if (isNew) this._registerPlatformAccessory();

        this.accessory.on('identify', function(paired, callback) {
            // ToDo: Add identification routine
            this.log("%s - identify", this.device.context.name);
            callback();
        }.bind(this));

        this.device.once('connect', () => {
            this.log('Connected to', this.device.context.name);
        });

        this.device.once('change', () => {
            this.log(`Ready to handle ${this.device.context.name} with signature ${JSON.stringify(this.device.state)}`);

            this._addEventHandlers(this.device.state);
        });

        this.device._connect();
    }

    _registerPlatformAccessory() {
        this.platform.registerPlatformAccessories(this.accessory);
    }

    getState(dp, callback) {
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
        this.setMultiState({[dp.toString()]: value}, callback);
    }

    setMultiState(dps, callback) {
        const ret = this.device.update(dps);
        callback && callback(!ret);
    }

    convertBrightnessFromHomeKitToTuya(value) {
        const min = this.device.context.minBrightness || 27;
        return Math.round(((255 - min) * value + 100 * min - 255) / 99);
    }

    convertBrightnessFromTuyaToHomeKit(value) {
        const min = this.device.context.minBrightness || 27;
        return Math.round((99 * value - 100 * min + 255) / (255 - min));
    }

    convertColorTemperatureFromHomeKitToTuya(value) {
        const min = this.device.context.minWhiteColor || 140;
        const max = this.device.context.maxWhiteColor || 400;
        const adjustedValue = (value - 71) * (max - min) / (600 - 71) + 153;
        const convertedValue = Math.round((255 * min / (max - min)) * ((max / adjustedValue) - 1));
        return Math.min(255, Math.max(0, convertedValue));
    }

    convertColorTemperatureFromTuyaToHomeKit(value) {
        const min = this.device.context.minWhiteColor || 140;
        const max = this.device.context.maxWhiteColor || 400;
        const unadjustedValue = max / ((value * (max - min) / (255 * min)) + 1);
        const convertedValue = Math.round((unadjustedValue - 153) * (600 - 71) / (max - min) + 71);
        return Math.min(600, Math.max(71, convertedValue));
    }

    convertColorFromHomeKitToTuya(value, dpValue) {
        const cached = this.convertColorFromTuyaToHomeKit(dpValue || this.device.state['5']);
        let {h, s, b} = {...cached, ...value};
        const hsb = h.toString(16).padStart(4, '0') + Math.round(2.55 * s).toString(16).padStart(2, '0') + Math.round(2.55 * b).toString(16).padStart(2, '0');
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
            })().map(c => Math.round(c).toString(16).padStart(2, '0')),
            hex = rgb.join('');

        return hex + hsb;
    }

    convertColorFromTuyaToHomeKit(value) {
        const [, h, s, b] = value.match(/^.{6}([0-9a-f]{4})([0-9a-f]{2})([0-9a-f]{2})$/i) || [0, 255, 255];
        return {
            h: parseInt(h, 16),
            s: Math.round(parseInt(s, 16) / 2.55),
            b: Math.round(parseInt(b, 16) / 2.55)
        };
    }


    /* Based on works of:
     * Tanner Helland (http://www.tannerhelland.com/4435/convert-temperature-rgb-algorithm-code/)
     * Neil Bartlett (http://www.zombieprototypes.com/?p=210)
     */

    /*
    getRGBFromMirek(value) {
        const dKelvin = 10000 / value;
        return [
            dKelvin > 66 ? 351.97690566805693 + 0.114206453784165 * (dKelvin - 55) - 40.25366309332127 * Math.log(dKelvin - 55) : 255,
            dKelvin > 66 ? 325.4494125711974 + 0.07943456536662342 * (dKelvin - 50) - 28.0852963507957 * Math.log(dKelvin - 55) : 104.49216199393888 * Math.log(dKelvin - 2) - 0.44596950469579133 * (dKelvin - 2) - 155.25485562709179,
            dKelvin > 66 ? 255 : 115.67994401066147 * Math.log(dKelvin - 10) + 0.8274096064007395 * (dKelvin - 10) - 254.76935184120902
        ].map(v => Math.max(0, Max.min(255, Math.round(v))));
    }
    */
}

module.exports = BaseAccessory;