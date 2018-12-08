const TuyaAccessory = require('./lib/TuyaAccessory');
const OutletAccessory = require('./lib/OutletAccessory');
const SimpleLightAccessory = require('./lib/SimpleLightAccessory');
const MultiOutletAccessory = require('./lib/MultiOutletAccessory');
const RGBTWLightAccessory = require('./lib/RGBTWLightAccessory');
const AirConditionerAccessory = require('./lib/AirConditionerAccessory');

const PLUGIN_NAME = 'homebridge-tuya-lan';
const PLATFORM_NAME = 'TuyaLan';

const CLASS_DEF = {
    outlet: OutletAccessory,
    simplelight: SimpleLightAccessory,
    rgbtwlight: RGBTWLightAccessory,
    multioutlet: MultiOutletAccessory,
    airconditioner: AirConditionerAccessory
};

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
        const fakeDevices = [];
        this.config.devices.forEach(device => {
            if (/^[0-9a-f]+$/i.test(device.id) &&
                /^[0-9a-f]+$/i.test(device.key) &&
                device.type && CLASS_DEF[device.type.toLowerCase()]
            ) {
                if (device.fake) fakeDevices.push({name: device.id.slice(8), ...device});
                else devices[device.id] = {name: device.id.slice(8), ...device};
            }
        });

        const deviceIds = Object.keys(devices);
        if (deviceIds.length === 0) return this.log.error('No valid configured devices found.');

        this.log.info('Starting discovery...');

        TuyaAccessory.discover({ids: deviceIds})
            .on('discover', config => {
                if (!config || !config.id) return;
                if (!devices[config.id]) return this.log.warn('Discovered a device that has not been configured yet (%s).', config.id);

                connectedDevices.push(config.id);

                this.log.info('Discovered %s (%s)', devices[config.id].name, config.id);

                const device = new TuyaAccessory({
                    ...devices[config.id], ...config,
                    UUID: UUID.generate(PLUGIN_NAME + ':' + config.id),
                    connect: false
                });
                this.addAccessory(device);
            });

        fakeDevices.forEach(config => {
            this.log.info('Adding fake device: %s', config.name);
            this.addAccessory(new TuyaAccessory({
                ...config,
                UUID: UUID.generate(PLUGIN_NAME + ':fake:' + config.id),
                connect: false
            }));
        });

        setTimeout(() => {
            deviceIds.forEach(deviceId => {
                if (connectedDevices.includes(deviceId)) return;

                this.log.warn('Failed to discover %s in time but will keep looking.', devices[deviceId].name);
                //this.removeAccessoryByUUID(UUID.generate(PLUGIN_NAME + ':' + deviceId));
            });
        }, 60000);
    }

    registerPlatformAccessories(platformAccessories) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, Array.isArray(platformAccessories) ? platformAccessories : [platformAccessories]);
    }

    configureAccessory(accessory) {
        if (accessory instanceof PlatformAccessory) {
            this.cachedAccessories.set(accessory.UUID, accessory);
            accessory.services.forEach(service => {
                if (service.UUID === Service.AccessoryInformation.UUID) return;
                service.characteristics.some(characteristic => {
                    if (!characteristic.props ||
                        !Array.isArray(characteristic.props.perms) ||
                        characteristic.props.perms.length !== 3 ||
                        !(characteristic.props.perms.includes(Characteristic.Perms.WRITE) && characteristic.props.perms.includes(Characteristic.Perms.NOTIFY))
                    ) return;

                    this.log.info('Marked %s unreachable by faulting Service.%s.%s', accessory.displayName, service.displayName, characteristic.displayName);

                    characteristic.updateValue(new Error('Unreachable'));
                    return true;
                });
            });
        } else {
            this.log.warn('Unregistering', accessory.displayName);
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    addAccessory(device) {
        const deviceConfig = device.context;
        const type = (deviceConfig.type || '').toLowerCase();

        const Accessory = CLASS_DEF[type];

        let accessory = this.cachedAccessories.get(deviceConfig.UUID),
            isCached = true;

        if (!accessory) {
            accessory = new PlatformAccessory(deviceConfig.name, deviceConfig.UUID, Accessory.getCategory(Categories));
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, (PLATFORM_NAME + ' ' + deviceConfig.manufacturer).trim())
                .setCharacteristic(Characteristic.Model, deviceConfig.model || "Unknown")
                .setCharacteristic(Characteristic.SerialNumber, deviceConfig.id.slice(8));

            isCached = false;
        }

        this.cachedAccessories.set(deviceConfig.UUID, new Accessory(this, accessory, device, !isCached));
    }

    removeAccessory(homebridgeAccessory) {
        if (!homebridgeAccessory) return;

        delete this.cachedAccessories[homebridgeAccessory.deviceId];
        this.api.unregisterPlatformAccessories(PLATFORM_NAME, PLATFORM_NAME, [homebridgeAccessory]);
    }

    removeAccessoryByUUID(uuid) {
        if (!uuid || !this.cachedAccessories.has(uuid)) return;

        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.cachedAccessories.get(uuid)]);

        this.cachedAccessories.delete(uuid);
    }
}
