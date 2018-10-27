const TuyaAccessory = require('./lib/TuyaAccessory');
const OutletAccessory = require('./lib/OutletAccessory');
const LightAccessory = require('./lib/LightAccessory');
const RGBTWAccessory = require('./lib/RGBTWAccessory');

const async = require('async');

const PLUGIN_NAME = 'homebridge-tuya-lan';
const PLATFORM_NAME = 'TuyaLan';
const CLASS_DEF = {outlet: OutletAccessory, light: LightAccessory, rgbtw: RGBTWAccessory};

let Characteristic, PlatformAccessory, Service, Categories, UUID;

module.exports = function(homebridge) {
    ({
        platformAccessory: PlatformAccessory,
        hap: {Characteristic, Service, Accessory: {Categories}, uuid: UUID}
    } = homebridge);

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
        const devices = {};
        const connectedDevices = [];
        this.config.devices.forEach(device => {
            devices[device.id] = device;
        });
        const deviceIds = Object.keys(devices);

        this.log.debug('Starting discovery...');

        TuyaAccessory.discover({ids: deviceIds})
            .on('discover', config => {
                connectedDevices.push(config.id);
                const device = new TuyaAccessory({name: config.id.slice(8), ...devices[config.id], ...config, UUID: UUID.generate(config.id), connect: false});
                this.log.debug('Discovered', device.context.name);
                this.addAccessory(device);
            });

        setTimeout(() => {
            deviceIds.forEach(deviceId => {
                if (connectedDevices.indexOf(deviceId) !== -1) return;
                const deviceConfig = devices[deviceId];

                this.log.debug('Failed to discover', deviceConfig.name);
                this.removeAccessoryByUUID(UUID.generate(deviceConfig.id));

                if (deviceConfig.type.toLowerCase() === 'powerstrip' && isFinite(deviceConfig.outlets) && deviceConfig.outlets > 1) {
                    for (let i = 0; i++ < deviceConfig.outlets;) {
                        this.removeAccessoryByUUID(UUID.generate(deviceConfig.id + '@' + i));
                    }
                }
            });
        }, 60000);
    }

    registerPlatformAccessories(platformAccessories) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, Array.isArray(platformAccessories) ? platformAccessories : [platformAccessories]);
    }

    configureAccessory(accessory) {
        if (accessory instanceof PlatformAccessory) {
            this.cachedAccessories.set(accessory.UUID, accessory);
        } else {
            this.log.debug('Unregistering', accessory);
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    addAccessory(device) {
        const deviceConfig = device.context;
        const type = (deviceConfig.type || '').toLowerCase();

        if (type === 'powerstrip') return this.addPowerStriptAccessory(device);

        this.log.info('Adding accessory:', deviceConfig.name);

        const Accessory = CLASS_DEF[type];

        this.log.info('Adding accessory type', type);

        let accessory = this.cachedAccessories.get(deviceConfig.UUID),
            isCached = true;

        if (!accessory) {
            this.log.debug('Defining new platform accessory:', deviceConfig.name);
            accessory = new PlatformAccessory(deviceConfig.name, deviceConfig.UUID, Accessory.getCategory(Categories));
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, PLATFORM_NAME + ' ' + deviceConfig.manufacturer)
                .setCharacteristic(Characteristic.Model, deviceConfig.model || "Unknown")
                .setCharacteristic(Characteristic.SerialNumber, deviceConfig.id.slice(8));

            isCached = false;
        }

        this.log.debug('Creating', isCached ? 'cached' : 'new', deviceConfig.name);
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
