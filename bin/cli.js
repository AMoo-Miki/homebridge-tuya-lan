#!/usr/bin/env node

const Proxy = require('http-mitm-proxy');
const EventEmitter = require('events');
const program = require('commander');
const QRCode = require('qrcode');
const path = require('path');
const os = require('os');
const JSON5 = require('json5');
const fs = require('fs-extra');

// Disable debug messages from the proxy
try {
    require('debug').disable();
} catch(ex) {}

const ROOT = path.resolve(__dirname);

const pemFile = path.join(ROOT, 'certs', 'ca.pem');

let localIPs = [];
const ifaces = os.networkInterfaces();
Object.keys(ifaces).forEach(name => {
    ifaces[name].forEach(network => {
        if (network.family === 'IPv4' && !network.internal) localIPs.push(network.address);
    });
});

const proxy = Proxy();
const emitter = new EventEmitter();

program
    .name('tuya-lan-find')
    .option('--ip <ip>', 'IP address to listen for requests')
    .option('-p, --port <port>', 'port the proxy should listen on', 8080)
    .option('--schema', 'include schema in the output')
    .option('--decode <key>', 'interactively decode messages');

program.version('v' + fs.readJSONSync(path.join(ROOT, '../package.json')).version, '-v, --version', 'output package version');

program.parse(process.argv);

if (program.decode) {           // decode
    const crypto = require('crypto');
    const readline = require('readline');

    console.log('\n\n*** Hit Ctrl+c or enter "exit" to end ***');

    const crc32LookupTable = [];
    (() => {
        for (let i = 0; i < 256; i++) {
            let crc = i;
            for (let j = 8; j > 0; j--) crc = (crc & 1) ? (crc >>> 1) ^ 3988292384 : crc >>> 1;
            crc32LookupTable.push(crc);
        }
    })();

    const getCRC32 = buffer => {
        let crc = 0xffffffff;
        for (let i = 0, len = buffer.length; i < len; i++) crc = crc32LookupTable[buffer[i] ^ (crc & 0xff)] ^ (crc >>> 8);
        return ~crc;
    };

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '\nEnter the encrypted message: ',
        crlfDelay: Infinity
    });

    rl.prompt();

    rl.on('line', line => {
        const input = line.trim();
        if (input.toLowerCase() === 'exit') process.exit(0);

        const encoding = (input.substr(0, 8) === '000055aa') ? 'hex' : 'base64';

        let buffer = Buffer.from(input, encoding);
        const raw = Buffer.from(input, encoding);
        const len = buffer.length;
        if (buffer.readUInt32BE(0) !== 0x000055aa || buffer.readUInt32BE(len - 4) !== 0x0000aa55) {
            console.log("*** Input doesn't match the expected signature:", buffer.readUInt32BE(0).toString(16).padStart(8, '0'), buffer.readUInt32BE(len - 4).toString(16).padStart(8, '0'));
            return rl.prompt();
        }

        // Try 3.3
        const size = buffer.readUInt32BE(12);
        const cmd = buffer.readUInt32BE(8);
        const seq = buffer.readUInt32BE(4);
        const crcIn = buffer.readInt32BE(len - 8);
        const preHash = buffer.slice(0, len - 8);
        console.log(`Cmd > ${cmd}\tLen > ${len}\tSize > ${size}\tSeq > ${seq}`);
        console.log(`CRC > \t${crcIn === getCRC32(preHash) ? `Pass ${crcIn}` : `Fail ${crcIn} ≠ ${getCRC32(preHash)}`}`);
        const flag = buffer.readUInt32BE(16) & 0xFFFFFF00;
        buffer = buffer.slice(len - size + (flag ? 0 : 4), len - 8);
        if (buffer.indexOf('3.3') !== -1) buffer = buffer.slice(15 + buffer.indexOf('3.3'));

        switch (cmd) {
            case 7:
            case 8:
            case 10:
            case 13:
            case 16:
                try {
                    const decipher = crypto.createDecipheriv('aes-128-ecb', program.decode, '');
                    let decryptedMsg = decipher.update(buffer, 'buffer', 'utf8');
                    decryptedMsg += decipher.final('utf8');

                    console.log('Decoded >', decryptedMsg);
                    console.log('Raw >', raw.toString('hex'));
                } catch (ex) {
                    console.log('Failed >', buffer.toString('utf8'));
                    console.log('Raw >', raw.toString('hex'));
                }
                break;

            case 9:
                console.log(flag ? 'Ping' : 'Pong');
        }



        rl.prompt();
    }).on('close', () => {
        process.exit(0);
    });
} else {                    // find keys
    if (program.ip) {
        if (localIPs.includes(program.ip)) localIPs = [program.ip];
        else {
            console.log(`The requested IP, ${program.ip}, is not a valid external IPv4 address. The valid options are:\n\t${localIPs.join('\n\t')}`);
            process.exit();
        }
    }
    if (localIPs.length > 1) {
        console.log(`You have multiple network interfaces: ${localIPs.join(', ')}\nChoose one by passing it with the --ip parameter.\n\nExample: tuya-lan-find --ip ${localIPs[0]}`);
        process.exit();
    }
    const localIPPorts = localIPs.map(ip => `${ip}:${program.port}`);

    const escapeUnicode = str => str.replace(/[\u00A0-\uffff]/gu, c => "\\u" + ("000" + c.charCodeAt().toString(16)).slice(-4));

    proxy.onError(function(ctx, err) {
        switch (err.code) {
            case 'ERR_STREAM_DESTROYED':
            case 'ECONNRESET':
                return;

            case 'ECONNREFUSED':
                console.log('Failed to intercept secure communications. This could happen due to bad CA certificate.');
                return;

            default:
                console.error('Error:', err);
        }
    });

    proxy.onRequest(function(ctx, callback) {
        if (ctx.clientToProxyRequest.method === 'GET' && ctx.clientToProxyRequest.url === '/cert' && localIPPorts.includes(ctx.clientToProxyRequest.headers.host)) {
            ctx.use(Proxy.gunzip);
            console.log('Intercepted certificate request');

            ctx.proxyToClientResponse.writeHeader(200, {
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=0',
                'Content-Type': 'application/x-x509-ca-cert',
                'Content-Disposition': 'attachment; filename=cert.pem',
                'Content-Transfer-Encoding': 'binary',
                'Content-Length': fs.statSync(pemFile).size,
                'Connection': 'keep-alive',
            });
            //ctx.proxyToClientResponse.end(fs.readFileSync(path.join(ROOT, 'certs', 'ca.pem')));
            ctx.proxyToClientResponse.write(fs.readFileSync(pemFile));
            ctx.proxyToClientResponse.end();

            return;

        } else if (ctx.clientToProxyRequest.method === 'POST' && /tuya/.test(ctx.clientToProxyRequest.headers.host)) {
            ctx.use(Proxy.gunzip);

            ctx.onRequestData(function(ctx, chunk, callback) {
                return callback(null, chunk);
            });
            ctx.onRequestEnd(function(ctx, callback) {
                callback();
            });

            let chunks = [];
            ctx.onResponseData(function(ctx, chunk, callback) {
                chunks.push(chunk);
                return callback(null, chunk);
            });
            ctx.onResponseEnd(function(ctx, callback) {
                emitter.emit('tuya-config', Buffer.concat(chunks).toString());
                callback();
            });
        }

        return callback();
    });

    emitter.on('tuya-config', body => {
        if (body.indexOf('tuya.m.my.group.device.list') === -1) return;
        console.log('Intercepted config from Tuya');
        let data;
        const fail = (msg, err) => {
            console.error(msg, err);
            process.exit(1);
        };
        try {
            data = JSON.parse(body);
        } catch (ex) {
            return fail('There was a problem decoding config:', ex);
        }
        if (!Array.isArray(data.result)) return fail('Couldn\'t find a valid result-set.');

        let devices = [];
        data.result.some(data => {
            if (data && data.a === 'tuya.m.my.group.device.list') {
                devices = data.result;
                return true;
            }
            return false;
        });

        if (!Array.isArray(devices)) return fail('Couldn\'t find a good list of devices.');

        console.log(`\nFound ${devices.length} device${devices.length === 1 ? '' : 's'}:`);

        const foundDevices = devices.map(device => {
            return {
                name: device.name,
                id: device.devId,
                key: device.localKey,
                pid: device.productId
            }
        });

        if (program.schema) {
            let schemas = [];
            data.result.some(data => {
                if (data && data.a === 'tuya.m.device.ref.info.my.list') {
                    schemas = data.result;
                    return true;
                }
                return false;
            });

            if (Array.isArray(schemas)) {
                const defs = {};
                schemas.forEach(schema => {
                    if (schema.id && schema.schemaInfo) {
                        defs[schema.id] = {};
                        if (schema.schemaInfo.schema) defs[schema.id].schema = escapeUnicode(schema.schemaInfo.schema);
                        if (schema.schemaInfo.schemaExt && schema.schemaInfo.schemaExt !== '[]') defs[schema.id].extras = escapeUnicode(schema.schemaInfo.schemaExt);
                    }
                });
                foundDevices.forEach(device => {
                    if (defs[device.pid]) device.def = defs[device.pid];
                });
            } else console.log('Didn\'t find schema definitions. You will need to identify the data-points manually if this is a new device.');
        }

        foundDevices.forEach(device => {
            delete device.pid;
        });

        console.log(JSON5.stringify(foundDevices, '\n', 2));

        setTimeout(() => {
            process.exit(0);
        }, 5000);
    });

    proxy.listen({port: program.port, sslCaDir: ROOT}, () => {
        let {address, port} = proxy.httpServer.address();
        if (address === '::' || address === '0.0.0.0') address = localIPs[0];

        QRCode.toString(`http://${address}:${port}/cert`, {type: 'terminal'}, function(err, url) {
            console.log(url);
            console.log('\nFollow the instructions on https://github.com/AMoo-Miki/homebridge-tuya-lan/wiki/Setup-Instructions');
            console.log(`Proxy IP: ${address}`);
            console.log(`Proxy Port: ${port}\n\n`);
        })
    });
}