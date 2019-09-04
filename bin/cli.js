#!/usr/bin/env node

const Proxy = require('http-mitm-proxy');
const EventEmitter = require('events');
const program = require('commander');
const QRCode = require('qrcode');
const path = require('path');
const os = require('os');
const fs = require('fs');

const ROOT = path.resolve(__dirname);

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
    .option('--ip <ip>', 'IP address to bind the proxy to')
    .option('-p, --port <port>', 'port the proxy should listen on', 8080);

program.parse(process.argv);
if (program.ip && localIPs.includes(program.ip)) localIPs = [program.ip];
if (localIPs.length > 1) {
    console.log(`You have multiple network interfaces: ${localIPs.join(', ')}\nChoose one by passing it with the --ip parameter.\n\nExample: tuya-lan-find --ip ${localIPs[0]}`);
    process.exit();
}

proxy.onError(function(ctx, err) {
    console.error('Error:', err);
});

proxy.onRequest(function(ctx, callback) {
    if (ctx.clientToProxyRequest.method === 'GET' && ctx.clientToProxyRequest.url === '/cert' && localIPs.includes(ctx.clientToProxyRequest.headers.host)) {
        ctx.use(Proxy.gunzip);

        ctx.onResponseData(function(ctx, chunk, callback) {
            return callback(null, null);
        });
        ctx.onResponseEnd(function(ctx, callback) {
            ctx.proxyToClientResponse.writeHeader(200, {
                'Content-Type': 'application/x-pem-file'
            });
            ctx.proxyToClientResponse.write(body);
            callback();
        });
    } else if (ctx.clientToProxyRequest.method === 'POST' && /tuya/.test(ctx.clientToProxyRequest.headers.host)) {
        ctx.use(Proxy.gunzip);

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
    console.log('Intercepted config from Tuya');
    let data;
    const fail = (msg, err) => {
        console.error(msg, err);
        process.exit(1);
    };
    try {
        data = JSON.parse(body);
    } catch(ex) {
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

    const foundDevices = devices.map(device => {
        return {
            id: device.devId,
            key: device.localKey,
            name: device.name,
            pid: device.productId
        }
    });

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
            if (schema.id && schema.schemaInfo) defs[schema.id] = schema.schemaInfo;
        });
        foundDevices.forEach(device => {
            if (defs[device[pid]]) device.def = defs[device[pid]];
        })
    } else console.log('Didn\'t find schema definitions. You will need to identify the data-points manually if this is a new device.');

    console.log(foundDevices);
});

proxy.listen({host: localIPs[0], port: 8080}, () => {
    let {address, port} = proxy.httpServer.address();
    if (address === '::' || address === '0.0.0.0') address = localIPs[0];

    QRCode.toString(`http://${address}:${port}/cert`, {type:'terminal'}, function (err, url) {
        console.log(url);
        console.log(`Proxy IP: ${address}`);
        console.log(`Proxy Port: ${port}`);
    })
});