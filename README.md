# homebridge-tuya-lan

Homebridge plugin for IoT devices that use Tuya Smart's platform, allowing them to be exposed to Apple's HomeKit.

## Installation
Install this plugin using `npm i -g homebridge-tuya-lan`.

Update the `config.json` file of your Homebridge setup, by modifying the sample configuration below. Detailed steps for getting the `id` and `key` combinations of your devices can be found on the [Setup Instructions](https://github.com/AMoo-Miki/homebridge-tuya-lan/wiki/Setup-Instructions) page.

## Updating
Update to the latest release of this plugin using `npm i -g homebridge-tuya-lan`.

If you feel brave, want to help test unreleased devices, or are asked to update to the latest _unreleased_ version of the plugin, use `npm i -g AMoo-Miki/homebridge-tuya-lan`. 

## Configurations
The configuration parameters to enable your devices would need to be added to `platforms` section of the Homebridge configuration file. Examples of device configs can be found on the [Supported Devices](https://github.com/AMoo-Miki/homebridge-tuya-lan/wiki/Supported-Devices) page. Check out the [Common Problems](https://github.com/AMoo-Miki/homebridge-tuya-lan/wiki/Common-Problems) page for solutions or raise an issue if you face problems.
```json5
{
    ...
    "platforms": [
        ...
        /* The block you need to enable this plugin */
        {
            "platform": "TuyaLan",
            "devices": [
                /* The block you need for each device */
                {
                    "name": "Hallway Light",
                    "type": "SimpleLight",
                    "manufacturer": "Cotify",
                    "model": "Smart Wifi Bulb Socket E26",
                    "id": "011233455677899abbcd",
                    "key": "0123456789abcdef"
                }
                /* End of the device definition block */ 
            ]
        }
        /* End of the block needed to enable this plugin */
    ]
    ...
}
```
#### Parameters
* `name` (required) is anything you'd like to use to identify this device. You can always change the name from within the Home app.
* `type` (required) is a case-insensitive identifier that lets the plugin know how to handle your device. Find your device `type` on the [Supported Devices](https://github.com/AMoo-Miki/homebridge-tuya-lan/wiki/Supported-Devices) page.
* `manufacturer` and `model` are anything you like; the purpose of them is to help you identify the device.
* `id` (required) and `key` (required) are parameters for your device. If you don't have them, follow the steps found on the [Setup Instructions](https://github.com/AMoo-Miki/homebridge-tuya-lan/wiki/Setup-Instructions) page.
* `ip` needs to be added **_only_** if you face discovery issues. See [Common Problems](https://github.com/AMoo-Miki/homebridge-tuya-lan/wiki/Common-Problems) for more details.   

> To find out which `id` belongs to which device, open the Tuya Smart app and check the `Device Information` by tapping the configuration icon of your devices; it is almost always a tiny icon on the top-right.

## Credit
To create this plugin, I learnt a lot from [Max Isom](https://maxisom.me/)'s work on his [TuyAPI](https://github.com/codetheweb/tuyapi) project to create my communication driver. 