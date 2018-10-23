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
        this._update(() => {
            callback(null, self._cache.dps[dp]);
        });
    }

    setState(dp, value, callback) {
        this._update(() => {
            callback(null, self._cache.dps[dp]);
        });
    }
}

module.exports = BaseAccessory;