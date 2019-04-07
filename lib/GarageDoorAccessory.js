const BaseAccessory = require('./BaseAccessory');

class GarageDoorAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.GARAGE_DOOR_OPENER;
    }

    constructor(...props) {
        super(...props);

        const {Service, Characteristic} = this.hap;
        this.currentOpen = Characteristic.CurrentDoorState.OPEN;
        this.currentOpening = Characteristic.CurrentDoorState.OPENING;
        this.currentClosing = Characteristic.CurrentDoorState.CLOSING;
        this.currentClosed = Characteristic.CurrentDoorState.CLOSED;
        this.targetOpen = Characteristic.TargetDoorState.OPEN;
        this.targetClosed = Characteristic.TargetDoorState.CLOSED;
        if (!!this.device.context.flipState) {
            this.currentOpen = Characteristic.CurrentDoorState.CLOSED;
            this.currentOpening = Characteristic.CurrentDoorState.CLOSING;
            this.currentClosing = Characteristic.CurrentDoorState.OPENING;
            this.currentClosed = Characteristic.CurrentDoorState.OPEN;
            this.targetOpen = Characteristic.TargetDoorState.CLOSED;
            this.targetClosed = Characteristic.TargetDoorState.OPEN;
        }
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.GarageDoorOpener, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.GarageDoorOpener);
        this._checkServiceName(service, this.device.context.name);

        const characteristicTargetDoorState = service.getCharacteristic(Characteristic.TargetDoorState)
            .updateValue(this._getTargetDoorState(dps['1']))
            .on('get', this.getTargetDoorState.bind(this))
            .on('set', this.setTargetDoorState.bind(this));

        const characteristicCurrentDoorState = service.getCharacteristic(Characteristic.CurrentDoorState)
            .updateValue(this._getCurrentDoorState(dps))
            .on('get', this.getCurrentDoorState.bind(this));

        this.device.on('change', (changes, state) => {
            console.log('[TuyaAccessory] GarageDoor changed: ' + JSON.stringify(state));

            if (changes.hasOwnProperty('1')) {
                const newCurrentDoorState = this._getCurrentDoorState(state);
                if (characteristicCurrentDoorState.value !== newCurrentDoorState) characteristicCurrentDoorState.updateValue(newCurrentDoorState);
            }
        });
    }

    getTargetDoorState(callback) {
        this.getState('1', (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getTargetDoorState(dp));
        });
    }

    _getTargetDoorState(dp) {
        return dp ? this.targetOpen : this.targetClosed;
    }

    setTargetDoorState(value, callback) {
        this.setState('1', value === this.targetOpen, callback);
    }

    getCurrentDoorState(callback) {
        this.getState(['1', '2'], (err, dps) => {
            if (err) return callback(err);

            callback(null, this._getCurrentDoorState(dps));
        });
    }

    _getCurrentDoorState(dps) {
        // ToDo: Check other `dps` for opening and closing states
        return dps['1'] ? this.currentOpen : this.currentClosed;
    }
}

module.exports = GarageDoorAccessory;