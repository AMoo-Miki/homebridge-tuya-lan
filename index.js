const OutletAccessory = require('./lib/OutletAccessory');
const LightAccessory = require('./lib/LightAccessory');
const RGBTWAccessory = require('./lib/RGBTWAccessory');

const async = require('async');
const TuyaDevice = require('tuyapi');

const PLUGIN_NAME = 'homebridge-tuya-lan';
const PLATFORM_NAME = 'TuyaLan';
const CLASS_DEF = {outlet: OutletAccessory, light: LightAccessory, rgbtw: RGBTWAccessory};

let Characteristic, PlatformAccessory, Service, Categories, UUID;

module.exports = function(homebridge) {
    ({platformAccessory: PlatformAccessory, hap: {Characteristic, Service, Accessory: {Categories}, uuid: UUID}} = homebridge);

    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, TuyaLan, true);
};

class TuyaLan {
    constructor(...props) {
        [this.log, this.config, this.api] = [...props];

        this.cachedAccessories = new Map();

        this.api.on('didFinishLaunching', () => {
            this.discoverDevices();
        });
    }

    discoverDevices() {
        const self = this;

        async.each(self.config.devices, (config, next) => {
            const device = new TuyaDevice({name: config.id.slice(8), ...config, UUID: UUID.generate(config.id)});

            async.retry({
                errorFilter: function(err) {
                    if (err.message.indexOf('timed out')) {
                        return true;
                    }
                    return false;
                },
                times: 5,
                interval: function(retryCount) {
                    return 250 * Math.pow(2, retryCount);
                }
            }, callback => {
                device.resolveId()
                    .then(() => {
                        callback();
                    })
                    .catch(err => {
                        callback(err);
                    });
            }, err => {
                const deviceConfig = device.device;

                if (err) {
                    self.log.debug('Failed to discover', deviceConfig.name);
                    self.removeAccessoryByUUID(deviceConfig.UUID);

                    if (deviceConfig.type.toLowerCase() === 'powerstrip' && isFinite(deviceConfig.outlets) && deviceConfig.outlets > 1) {
                        for (let i = 0; i++ < deviceConfig.outlets;) {
                            self.removeAccessoryByUUID(UUID.generate(config.id + '@' + i));
                        }
                    }
                } else {
                    self.log.debug('Discovered', deviceConfig.name);
                    self.addAccessory(device);
                }
                next();
            });
        }, err => {
            if (err) self.log.error('Error discovering devices', err);
        });
    }

    registerPlatformAccessories(platformAccessories) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, Array.isArray(platformAccessories) ? platformAccessories : [platformAccessories]);
    }

    configureAccessory(accessory) {
        if (accessory instanceof PlatformAccessory) {
            this.cachedAccessories.set(accessory.UUID, accessory);
        } else {
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    addAccessory(device) {
        const deviceConfig = device.device;
        const type = (deviceConfig.type || '').toLowerCase();

        if (type === 'powerstrip') return this.addPowerStriptAccessory(device);

        this.log.info('Adding accessory', deviceConfig.name);

        const Accessory = CLASS_DEF[deviceConfig.type];

        let accessory = this.cachedAccessories.get(deviceConfig.UUID),
            isCached = true;

        if (!accessory) {
            this.log.debug('New accessory', deviceConfig.name);
            accessory = new PlatformAccessory(deviceConfig.name, deviceConfig.UUID, Accessory.getCategory(Categories));
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, PLATFORM_NAME + ' ' + deviceConfig.manufacturer)
                .setCharacteristic(Characteristic.Model, deviceConfig.model || "Unknown")
                .setCharacteristic(Characteristic.SerialNumber, deviceConfig.id.slice(8));

            isCached = false;
        }

        this.log.debug('Creating', Accessory.constructor.name, 'for', deviceConfig.name);
        this.cachedAccessories.set(deviceConfig.UUID, new Accessory(this, accessory, device, !isCached));
    }

    addPowerStriptAccessory(device) {
        const deviceConfig = device.device;
        this.log.info('Adding power-strip', deviceConfig.id);
    }

    removeAccessory(homebridgeAccessory) {
        if (!homebridgeAccessory) return;

        this.log.info('Removing accessory', homebridgeAccessory.displayName);

        delete this.cachedAccessories[homebridgeAccessory.deviceId];
        this.api.unregisterPlatformAccessories(PLATFORM_NAME, PLATFORM_NAME, [homebridgeAccessory]);
    }

    removeAccessoryByUUID(uuid) {
        if (!uuid || !this.cachedAccessories.has(uuid)) return;

        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.cachedAccessories.get(uuid)]);

        this.cachedAccessories.delete(uuid);
    }
}
