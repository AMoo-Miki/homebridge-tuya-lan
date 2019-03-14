const net = require('net');
const async = require('async');
const dgram = require('dgram');
const forge = require('node-forge');
const EventEmitter = require('events');

const _discovery = new EventEmitter();
_discovery.discovered = new Map();
_discovery.limitedIds = [];

const isNonEmptyPlainObject = o => {
    if (!o) return false;
    for (let i in o) return true;
    return false;
};

let server;

class TuyaAccessory extends EventEmitter {
    constructor(props) {
        super();

        if (!(props.id && props.key && props.ip) && !props.fake) return console.log('[TuyaAccessory] Insufficient details to initialize:', props);

        this.context = {version: '3.1', port: 6668, ...props};
        this._encryptedPrefixLength = this.context.version.length + 16;

        this.cipher = forge.cipher.createCipher('AES-ECB', this.context.key);
        this.decipher = forge.cipher.createDecipher('AES-ECB', this.context.key);

        this.state = {};
        this._cachedBuffer = Buffer.allocUnsafe(0);

        this._msgQueue = async.queue(this._msgHandler.bind(this), 1);

        this.connected = false;
        if (props.connect !== false) this._connect();
    }

    _connect() {
        if (this.context.fake) {
            this.connected = true;
            return setTimeout(() => {
                this.emit('change', {}, this.state);
            }, 1000);
        }

        this._socket = net.Socket();

        (this._socket.reconnect = () => {
            if (this._socket._pinger) {
                clearTimeout(this._socket._pinger);
                this._socket._pinger = null;
            }

            if (this._socket._connTimeout) {
                clearTimeout(this._socket._connTimeout);
                this._socket._connTimeout = null;
            }

            this._socket.setKeepAlive(true);
            this._socket.setNoDelay(true);

            this._socket._connTimeout = setTimeout(() => {
                this._socket.emit('error', new Error('ERR_CONNECTION_TIMED_OUT'));
                //this._socket.destroy();
                //process.nextTick(this._connect.bind(this));
            }, (this.context.connectTimeout || 30) * 1000);

            this._socket.connect(this.context.port, this.context.ip);
        })();

        this._socket._ping = () => {
            if (this._socket._pinger) clearTimeout(this._socket._pinger);
            this._socket._pinger = setTimeout(() => {
                this._socket.emit('error', new Error('ERR_PING_TIMED_OUT'));
                //this._socket.reconnect();
            }, (this.context.pingTimeout || 30) * 1000);

            this._send({
                cmd: 9
            });
        };

        this._socket.on('connect', () => {
            clearTimeout(this._socket._connTimeout);

            this.connected = true;
            this.emit('connect');
            this._socket._ping();

            if (this.context.intro === false) {
                this.emit('change', {}, this.state);
                process.nextTick(this.update.bind(this));
            }
        });

        this._socket.on('ready', () => {
            if (this.context.intro === false) return;
            this.connected = true;
            this.update();
        });

        this._socket.on('data', msg => {
            this._cachedBuffer = Buffer.concat([this._cachedBuffer, msg]);

            do {
                let startingIndex = this._cachedBuffer.indexOf('000055aa', 'hex');
                if (startingIndex === -1) {
                    this._cachedBuffer = Buffer.allocUnsafe(0);
                    break;
                }
                if (startingIndex !== 0) this._cachedBuffer = this._cachedBuffer.slice(startingIndex);

                let endingIndex = this._cachedBuffer.indexOf('0000aa55', 'hex');
                if (endingIndex === -1) break;

                endingIndex += 4;

                this._msgQueue.push({msg: this._cachedBuffer.slice(0, endingIndex)});

                this._cachedBuffer = this._cachedBuffer.slice(endingIndex);
            } while (this._cachedBuffer.length);
        });

        this._socket.on('error', err => {
            this.connected = false;
            console.log('[TuyaAccessory] Socket had a problem and will reconnect to', this.context.name, '(' + (err && err.code || err) + ')');

            if (err && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
                return process.nextTick(this._socket.reconnect.bind(this));
            }

            this._socket.destroy();

            setTimeout(() => {
                process.nextTick(this._connect.bind(this));
            }, 5000);
        });

        this._socket.on('close', err => {
            this.connected = false;
            console.log('[TuyaAccessory] Closed connection with', this.context.name);
        });

        this._socket.on('end', () => {
            this.connected = false;
            console.log('[TuyaAccessory] Disconnected from', this.context.name);
        });
    }

    _msgHandler(task, callback) {
        const result = TuyaAccessory.translate(task.msg)
        if (this.context.intro === false && (!result || result.cmd !== 9))
            console.log('[TuyaAccessory] Message from', this.context.name + ':', JSON.stringify(result));

        switch (result.cmd) {
            case 7:
                // ignoring
                break;

            case 9:
                if (this._socket._pinger) clearTimeout(this._socket._pinger);
                this._socket._pinger = setTimeout(() => {
                    this._socket._ping();
                }, (this.context.pingGap || 20) * 1000);
                break;

            case 8:
                if (typeof result.data === 'string') {
                    this.decipher.start({iv: ''});
                    this.decipher.update(forge.util.createBuffer(forge.util.decode64(result.data.substr(this._encryptedPrefixLength))));
                    this.decipher.finish();

                    const decryptedMsg = this.decipher.output.data;
                    try {
                        result.data = JSON.parse(decryptedMsg);
                    } catch (ex) {
                        result.data = decryptedMsg;
                        console.log('[TuyaAccessory] Odd message from', this.context.name, 'with command 8:', result);
                    }

                    if (result.data) {
                        //console.log('[TuyaAccessory] Update from', this.context.name, 'with command', result.cmd + ':', result.data.dps);
                        this._change(result.data.dps);
                    }
                } else {
                    console.log('[TuyaAccessory] Odd message from', this.context.name, 'with command 8:', result);
                }
                break;

            case 10:
                if (result.data) {
                    //console.log('[TuyaAccessory] Update from', this.context.name, 'with command', result.cmd + ':', result.data.dps);
                    this._change(result.data.dps);
                }
                break;

            default:
                console.log('[TuyaAccessory] Odd message from', this.context.name, 'with command', result.cmd + ':', result);
        }

        callback();
    }

    update(o) {
        const dps = {};
        let hasDataPoint = false;
        o && Object.keys(o).forEach(key => {
            if (!isNaN(key)) {
                dps['' + key] = o[key];
                hasDataPoint = true;
            }
        });

        if (this.context.fake) {
            if (hasDataPoint) this._fakeUpdate(dps);
            return true;
        }

        let result = false;
        if (hasDataPoint) {
            console.log("[TuyaAccessory] Sending", this.context.name, JSON.stringify(dps));
            result = this._send({
                data: {
                    devId: this.context.id,
                    uid: '',
                    t: (Date.now() / 1000).toFixed(0),
                    dps: dps
                },
                cmd: 7
            });
            if (result !== true) console.log("[TuyaAccessory] Result", result);
        } else {
            result = this._send({
                data: {
                    gwId: this.context.id,
                    devId: this.context.id
                },
                cmd: 10
            });
        }

        return result;
    }

    _change(data) {
        if (!isNonEmptyPlainObject(data)) return;

        const changes = {};
        Object.keys(data).forEach(key => {
            if (data[key] !== this.state[key]) {
                changes[key] = data[key];
            }
        });

        if (isNonEmptyPlainObject(changes)) {
            this.state = {...this.state, ...data};
            this.emit('change', changes, this.state);
        }
    }

    _send(o) {
        if (this.context.fake) return;

        if (!this.connected) return false;
        const {cmd, data} = {...o};
        let payload;

        switch (cmd) {
            case 7:
                this.cipher.start({iv: ''});
                this.cipher.update(forge.util.createBuffer(JSON.stringify(data), 'utf8'));
                this.cipher.finish();

                const msg = forge.util.encode64(this.cipher.output.data);
                const hash = forge.md.md5.create().update('data=' + msg + '||lpv=' + this.context.version + '||' + this.context.key).digest().toHex().toString().toLowerCase().substr(8, 16);

                payload = Buffer.from(this.context.version + hash + msg);
                break;

            case 9:
                payload = Buffer.allocUnsafe(0);
                break;

            case 10:
                payload = Buffer.from(JSON.stringify(data));
                break;

        }

        const prefix = Buffer.from('000055aa00000000000000' + cmd.toString(16).padStart(2, '0'), 'hex');
        const suffix = Buffer.from('000000000000aa55', 'hex');
        const len = Buffer.allocUnsafe(4);
        len.writeInt32BE(Buffer.concat([payload, suffix]).length, 0);
        return this._socket.write(Buffer.concat([prefix, len, payload, suffix]));
    }

    _fakeUpdate(dps) {
        console.log('[TuyaAccessory] Fake update:', JSON.stringify(dps));
        Object.keys(dps).forEach(dp => {
            this.state[dp] = dps[dp];
        });
        setTimeout(() => {
            this.emit('change', dps, this.state);
        }, 1000);
    }

    static discover(options) {
        let opts = options || {};

        if (opts.clear) {
            _discovery.removeAllListeners();
            _discovery.discovered.clear();
        }

        if (Array.isArray(opts.ids)) {
            _discovery.limitedIds = opts.ids;
        } else {
            _discovery.limitedIds.splice(0);
        }

        if (server) {
            server._stopRequested = false;
            return _discovery;
        }

        server = dgram.createSocket('udp4');

        server.on('error', err => {
            if (err && err.code === 'EADDRINUSE') {
                console.log('[TuyaAccessory] Discovery error: Port 6666 is in use. Will retry in 15 seconds.');
                _discovery.stop();
                setTimeout(() => {
                    _discovery.start();
                }, 15000);
            } else {
                console.log(`[TuyaAccessory] Discovery error:\n${err.stack}`);
                server.close();
            }
        });

        server.on('close', () => {
            console.log('[TuyaAccessory] Discovery stopped.', server._stopRequested ? '' : ' Restarting...');
            if (!server._stopRequested) process.nextTick(() => {
                _discovery.start();
            });
            server._stopRequested = false;
        });

        server.on('message', msg => {
            let result = TuyaAccessory.translate(msg);
            if (!result || !result.data || !result.data.gwId || !result.data.ip) return;

            if (_discovery.discovered.has(result.data.gwId)) return;

            result.data.id = result.data.gwId;
            delete result.data.gwId;

            _discovery.discovered.set(result.data.id, result.data.ip);

            _discovery.emit('discover', result.data);

            if (Array.isArray(_discovery.limitedIds) &&
                _discovery.limitedIds.length &&
                _discovery.limitedIds.includes(result.data.id) &&
                _discovery.limitedIds.length <= _discovery.discovered.size &&
                _discovery.limitedIds.every(id => _discovery.discovered.has(id))
            ) {
                process.nextTick(() => {
                    _discovery.destroy();
                });
            }

        });

        _discovery.stop = () => {
            if (!server) return;
            server._stopRequested = true;
            server.close();
        };

        _discovery.destroy = () => {
            if (!server) return;
            _discovery.emit('end');
            server._stopRequested = true;
            server.removeAllListeners();
            server.close();
            server = null;
            console.log('[TuyaAccessory] Discovery ended.');
            process.nextTick(() => {
                _discovery.removeAllListeners();
                _discovery.discovered.clear();
            });
        };

        (_discovery.start = () => {
            try {
                if (server) {
                    server.bind(6666, () => {
                        console.log('[TuyaAccessory] Discovery started.');
                    });
                    return _discovery;
                }
            } catch (ex) {
                // server is not in a usable form; just fall through and restart discovery
            }

            console.log('[TuyaAccessory] Discovery restarting...');

            try {
                if (server) {
                    server.removeAllListeners();
                    server.close();
                }
            } catch (ex) {
                // Do nothing
            }

            server = null;
            return TuyaAccessory.discover(opts);
        })();

        return _discovery;
    }

    static translate(msg) {
        if (!(msg instanceof Buffer)) return;

        const len = msg.length;
        if (len < 16 ||
            msg.readUInt32BE(0) !== 0x000055aa ||
            msg.readUInt32BE(len - 4) !== 0x0000aa55
        ) return;

        const size = msg.readUInt32BE(12);
        if (len - 8 < size) return;

        const result = {cmd: msg.readUInt8(11)};
        const cleanMsg = msg.slice(len - size, len - 8).toString('utf8').trim().replace(/\0/g, '');
        try {
            result.data = JSON.parse(cleanMsg);
        } catch (ex) {
            result.data = cleanMsg;
        }

        return result;
    }
}

module.exports = TuyaAccessory;