const BaseAccessory = require('./BaseAccessory');

class GarageDoorAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.GARAGE_DOOR_OPENER;
    }

    constructor(...props) {
        super(...props);
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.GarageDoorOpener, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.GarageDoorOpener);

        const characteristicTargetDoorState = service.getCharacteristic(Characteristic.TargetDoorState)
            .updateValue(this._getTargetDoorState(dps['1']))
            .on('get', this.getTargetDoorState.bind(this))
            .on('set', this.setTargetDoorState.bind(this));

        const characteristicCurrentDoorState = service.getCharacteristic(Characteristic.CurrentDoorState)
            .updateValue(this._getCurrentDoorState(dps))
            .on('get', this.getCurrentDoorState.bind(this));

        this.device.on('change', (changes, state) => {
            if (changes.hasOwnProperty('1') && characteristicOn.value !== changes['1']) characteristicOn.updateValue(changes['1']);
            console.log('[TuyaAccessory] GarageDoor changed: ' + JSON.stringify(state));
        });
    }

    getTargetDoorState(callback) {
        this.getState('1', (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getTargetDoorState(dp));
        });
    }

    _getTargetDoorState(dp) {
        const {Characteristic} = this.hap;

        return dp ? Characteristic.TargetDoorState.OPEN : Characteristic.TargetDoorState.CLOSED;
    }

    setTargetDoorState(value, callback) {
        const {Characteristic} = this.hap;

        this.setState('1', value === Characteristic.TargetDoorState.OPEN, callback);
    }

    getCurrentDoorState(callback) {
        this.getState(['1', '2'], (err, dps) => {
            if (err) return callback(err);

            callback(null, this._getCurrentDoorState(dps));
        });
    }

    _getCurrentDoorState(dps) {
        const {Characteristic} = this.hap;

        return dps['1'] ? Characteristic.CurrentDoorState.OPEN : Characteristic.CurrentDoorState.CLOSED;
    }
}

module.exports = GarageDoorAccessory;