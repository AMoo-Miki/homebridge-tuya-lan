const BaseAccessory = require('./BaseAccessory');

class ConvectorAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.AIR_HEATER;
    }

    constructor(...props) {
        super(...props);
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.HeaterCooler, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.HeaterCooler);

        const characteristicActive = service.getCharacteristic(Characteristic.Active)
            .updateValue(this._getActive(dps['7']))
            .on('get', this.getActive.bind(this))
            .on('set', this.setActive.bind(this));

        service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .updateValue(this._getCurrentHeaterCoolerState(dps))
            .on('get', this.getCurrentHeaterCoolerState.bind(this));

        service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .setProps({
                minValue: 1,
                maxValue: 1,
                validValues: [Characteristic.TargetHeaterCoolerState.HEAT]
            })
            .updateValue(this._getTargetHeaterCoolerState())
            .on('get', this.getTargetHeaterCoolerState.bind(this))
            .on('set', this.setTargetHeaterCoolerState.bind(this));

        const characteristicCurrentTemperature = service.getCharacteristic(Characteristic.CurrentTemperature)
            .updateValue(dps['3'])
            .on('get', this.getState.bind(this, '3'));


        const characteristicHeatingThresholdTemperature = service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .setProps({
                minValue: this.device.context.minTemperature || 15,
                maxValue: this.device.context.maxTemperature || 35,
                minStep: this.device.context.minTemperatureSteps || 1
            })
            .updateValue(dps['2'])
            .on('get', this.getState.bind(this, '2'))
            .on('set', this.setTargetThresholdTemperature.bind(this));


        let characteristicTemperatureDisplayUnits;
        if (!this.device.context.noTemperatureUnit) {
            characteristicTemperatureDisplayUnits = service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                .updateValue(this._getTemperatureDisplayUnits(dps['19']))
                .on('get', this.getTemperatureDisplayUnits.bind(this))
                .on('set', this.setTemperatureDisplayUnits.bind(this));
        }

        let characteristicLockPhysicalControls;
        if (!this.device.context.noChildLock) {
            characteristicLockPhysicalControls = service.getCharacteristic(Characteristic.LockPhysicalControls)
                .updateValue(this._getLockPhysicalControls(dps['6']))
                .on('get', this.getLockPhysicalControls.bind(this))
                .on('set', this.setLockPhysicalControls.bind(this));
        }

        const characteristicRotationSpeed = service.getCharacteristic(Characteristic.RotationSpeed)
            .updateValue(this._getRotationSpeed(dps))
            .on('get', this.getRotationSpeed.bind(this))
            .on('set', this.setRotationSpeed.bind(this));

        this.characteristicHeatingThresholdTemperature = characteristicHeatingThresholdTemperature;

        this.device.on('change', (changes, state) => {
            if (changes.hasOwnProperty('7')) {
                const newActive = this._getActive(changes['7']);
                if (characteristicActive.value !== newActive) {
                    characteristicActive.updateValue(newActive);

                    if (!changes.hasOwnProperty('4')) {
                        characteristicRotationSpeed.updateValue(this._getRotationSpeed(state));
                    }
                }
            }

            if (changes.hasOwnProperty('6')) {
                const newLockPhysicalControls = this._getLockPhysicalControls(changes['6']);
                if (characteristicLockPhysicalControls.value !== newLockPhysicalControls) {
                    characteristicLockPhysicalControls.updateValue(newLockPhysicalControls);
                }
            }

            if (changes.hasOwnProperty('2')) {
                if (characteristicHeatingThresholdTemperature.value !== changes['2'])
                    characteristicHeatingThresholdTemperature.updateValue(changes['2']);
            }

            if (changes.hasOwnProperty('3') && characteristicCurrentTemperature.value !== changes['3']) characteristicCurrentTemperature.updateValue(changes['3']);

            if (characteristicTemperatureDisplayUnits && changes.hasOwnProperty('19')) {
                const newTemperatureDisplayUnits = this._getTemperatureDisplayUnits(changes['19']);
                if (characteristicTemperatureDisplayUnits.value !== newTemperatureDisplayUnits) characteristicTemperatureDisplayUnits.updateValue(newTemperatureDisplayUnits);
            }

            if (changes.hasOwnProperty('4')) {
                const newRotationSpeed = this._getRotationSpeed(state);
                if (characteristicRotationSpeed.value !== newRotationSpeed) characteristicRotationSpeed.updateValue(newRotationSpeed);
            }
        });
    }

    getActive(callback) {
        this.getState('7', (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getActive(dp));
        });
    }

    _getActive(dp) {
        const {Characteristic} = this.hap;

        return dp ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
    }

    setActive(value, callback) {
        const {Characteristic} = this.hap;

        switch (value) {
            case Characteristic.Active.ACTIVE:
                return this.setState('7', true, callback);

            case Characteristic.Active.INACTIVE:
                return this.setState('7', false, callback);
        }

        callback();
    }

    getLockPhysicalControls(callback) {
        this.getState('6', (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getLockPhysicalControls(dp));
        });
    }

    _getLockPhysicalControls(dp) {
        const {Characteristic} = this.hap;

        return dp ? Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED : Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
    }

    setLockPhysicalControls(value, callback) {
        const {Characteristic} = this.hap;

        switch (value) {
            case Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED:
                return this.setState('6', true, callback);

            case Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED:
                return this.setState('6', false, callback);
        }

        callback();
    }

    getCurrentHeaterCoolerState(callback) {
        this.getState(['7'], (err, dps) => {
            if (err) return callback(err);

            callback(null, this._getCurrentHeaterCoolerState(dps));
        });
    }

    _getCurrentHeaterCoolerState(dps) {
        const {Characteristic} = this.hap;
        return dps['7'] ? Characteristic.CurrentHeaterCoolerState.HEATING : Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    getTargetHeaterCoolerState(callback) {
        callback(null, this._getTargetHeaterCoolerState());
    }

    _getTargetHeaterCoolerState() {
        const {Characteristic} = this.hap;
        return Characteristic.TargetHeaterCoolerState.HEAT;
    }

    setTargetHeaterCoolerState(value, callback) {
        this.setState('7', true, callback);
    }

    setTargetThresholdTemperature(value, callback) {
        this.setState('2', value, err => {
            if (err) return callback(err);

            if (this.characteristicHeatingThresholdTemperature) {
                this.characteristicHeatingThresholdTemperature.updateValue(value);
            }

            callback();
        });
    }

    getTemperatureDisplayUnits(callback) {
        this.getState('19', (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getTemperatureDisplayUnits(dp));
        });
    }

    _getTemperatureDisplayUnits(dp) {
        const {Characteristic} = this.hap;

        return dp === 'F' ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT : Characteristic.TemperatureDisplayUnits.CELSIUS;
    }

    setTemperatureDisplayUnits(value, callback) {
        const {Characteristic} = this.hap;

        this.setState('19', value === Characteristic.TemperatureDisplayUnits.FAHRENHEIT ? 'F' : 'C', callback);
    }

    getRotationSpeed(callback) {
        this.getState(['7', '4'], (err, dps) => {
            if (err) return callback(err);

            callback(null, this._getRotationSpeed(dps));
        });
    }

    _getRotationSpeed(dps) {
        if (!dps['7']) return 0;

        if (this._hkRotationSpeed) {
            const currntRotationSpeed = this.convertRotationSpeedFromHomeKitToTuya(this._hkRotationSpeed);

            return currntRotationSpeed === dps['4'] ? this._hkRotationSpeed : this.convertRotationSpeedFromTuyaToHomeKit(dps['4']);
        }

        return this._hkRotationSpeed = this.convertRotationSpeedFromTuyaToHomeKit(dps['4']);
    }

    setRotationSpeed(value, callback) {
        const {Characteristic} = this.hap;

        if (value === 0) {
            this.setActive(Characteristic.Active.INACTIVE, callback);
        } else {
            this._hkRotationSpeed = value;
            this.setMultiState({'7': true, '4': this.convertRotationSpeedFromHomeKitToTuya(value)}, callback);
        }
    }

    convertRotationSpeedFromTuyaToHomeKit(value) {
        return {Low: 1, High: 100}[value];
    }

    convertRotationSpeedFromHomeKitToTuya(value) {
        return value < 50 ? 'Low' : 'High';
    }
}

module.exports = ConvectorAccessory;