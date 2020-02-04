const BaseAccessory = require('./BaseAccessory');

class ContactSensorAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.SENSOR;
    }

    constructor(...props) {
        super(...props);
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.ContactSensor, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.ContactSensor);
        this._checkServiceName(service, this.device.context.name);

        const dpState = this._getCustomDP(this.device.context.dpState) || '101';
        const dpFlipState = this.device.context.dpFlipState && this.device.context.dpFlipState !== 'false';
        const dpActive = this._getCustomDP(this.device.context.dpActive);
        const dpFlipActive = this.device.context.dpFlipActive && this.device.context.dpFlipActive !== 'false';
        const dpTamperedAlarm = this._getCustomDP(this.device.context.dpTamperedAlarm);
        const dpFaultAlarm = this._getCustomDP(this.device.context.dpFaultAlarm);
        const dpBatteryLevel = this._getCustomDP(this.device.context.dpBatteryLevel);

        this._registerTranslators({
            [dpState]: [Characteristic.ContactSensorState.CONTACT_NOT_DETECTED, Characteristic.ContactSensorState.CONTACT_DETECTED, dpFlipState],
            [dpActive]: [false, true, dpFlipActive],
            [dpTamperedAlarm]: [Characteristic.StatusTampered.NOT_TAMPERED, Characteristic.StatusTampered.TAMPERED],
            [dpFaultAlarm]: [Characteristic.StatusFault.NO_FAULT, Characteristic.StatusFault.GENERAL_FAULT],
            [dpBatteryLevel]: [Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW, val => val <= 10]
        });

        const characteristic = {};
        const collection = Object.entries({
            ContactSensorState: dpState,
            StatusActive: dpActive,
            StatusTampered: dpTamperedAlarm,
            StatusFault: dpFaultAlarm,
            StatusLowBattery: dpBatteryLevel
        }).filter((charName, dpKey) => dpKey && dpKey !== true);

        for (let [charName, dpKey] of collection) {
            characteristic[charName] = service.getCharacteristic(Characteristic[charName])
                .updateValue(this._getTranslatedState(dpKey, dps[dpKey]))
                .on('get', this.getTranslatedState.bind(this, dpKey));
        }

        this.device.on('change', (changes, state) => {
            for (let [charName, dpKey] of collection) {
                if (characteristic[charName] && changes.hasOwnProperty(dpKey)) {
                    const value = this._getTranslatedState(dpKey, changes[dpKey]);
                    if (characteristic[charName].value !== value) characteristic[charName].updateValue(value);
                }
            }

            console.log('[TuyaAccessory] ContactSensor changed: ' + JSON.stringify(state));
        });
    }
}

module.exports = ContactSensorAccessory;