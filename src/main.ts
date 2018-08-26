import * as noble from 'noble';
import * as yargs from 'yargs';
import { InfluxDB } from 'influx';

interface IMicrobitDevice {
  name: string;
  address: string;
  uuid: string;
  rssi: number;
}

interface IMicrobitServiceHandler {
  name: string;
  serviceId: string;
  uuid: string;
  parseData(data: Buffer): number[];
}

class TemperatureServiceHandler implements IMicrobitServiceHandler {
  public name: string = 'temperature';
  public serviceId: string = 'e95d6100251d470aa062fa1922dfa9a8';
  public uuid: string = 'e95d9250251d470aa062fa1922dfa9a8';
  public parseData(data: Buffer): number[] {
    return [data.readInt8(0)];
  }
}

/* class MagnetometerServiceHandler implements IMicrobitServiceHandler {
 *   name = 'magnetometer';
 *   serviceId = 'e95df2d8251d470aa062fa1922dfa9a8';
 *   uuid = 'e95dfb11251d470aa062fa1922dfa9a8';
 *   parseData(data: Buffer): number[] {
 *     const x = data.readInt16LE(0) / 1000.0;
 *     const y = data.readInt16LE(2) / 1000.0;
 *     const z = data.readInt16LE(4) / 1000.0;
 *     return [x, y, z];
 *   }
 * }
 *
 * class AccelerometerServiceHandler implements IMicrobitServiceHandler {
 *   name = 'accelerometer';
 *   serviceId = 'e95d0753251d470aa062fa1922dfa9a';
 *   uuid = 'e95dca4b251d470aa062fa1922dfa9a8';
 *   parseData(data: Buffer): number[] {
 *     const x = data.readInt16LE(0) / 1000.0;
 *     const y = data.readInt16LE(2) / 1000.0;
 *     const z = data.readInt16LE(4) / 1000.0;
 *     return [x, y, z];
 *   }
 * } */

const MICROBIT_DEVICE_NAME = 'BBC micro:bit [tizag]';

const connectedPeripheral: Set<noble.Peripheral> = new Set();

let influx: InfluxDB = null;

function onPeripheralConnected(
  peripheral: noble.Peripheral,
  device: IMicrobitDevice,
) {
  console.log(`connected (uuid=${device.uuid})`);
  const allServiceHandlers: IMicrobitServiceHandler[] = [
    new TemperatureServiceHandler(),
    /* new MagnetometerServiceHandler(),
     * new AccelerometerServiceHandler(), */
  ];
  peripheral.on('servicesDiscover', (services: noble.Service[]) => {
    console.log('servicesDiscover');
    for (const service of services) {
      const handler = allServiceHandlers.find(
        (handler: IMicrobitServiceHandler) =>
          handler.serviceId === service.uuid,
      );
      if (handler !== undefined) {
        service.on(
          'characteristicsDiscover',
          (characteristics: noble.Characteristic[]) => {
            console.log('characteristicsDiscover');
            for (const character of characteristics) {
              let counter: number = 0;
              character.on('data', (data: Buffer, isNotification: boolean) => {
                if (counter % 100 === 0) {
                  console.log('name:', handler.name);
                  console.log('data', handler.parseData(data));
                  counter = 0;
                }
                ++counter;
                if (influx) {
                  influx
                    .writePoints([
                      {
                        measurement: handler.name,
                        fields: {
                          data: handler.parseData(data),
                        },
                      },
                    ])
                    .catch((err: Error) => {
                      console.error('error saving data to InfluxDB', err);
                    });
                }
              });
              character.subscribe();
            }
          },
        );
        service.on('includedServicesDiscover', () => {
          service.discoverCharacteristics([handler.uuid]);
        });
        service.discoverIncludedServices([]);
      }
    }
  });
  peripheral.discoverServices([]);
}

function onDiscover(peripheral: noble.Peripheral) {
  if (peripheral.advertisement.localName === MICROBIT_DEVICE_NAME) {
    const device: IMicrobitDevice = {
      name: peripheral.advertisement.localName,
      uuid: peripheral.uuid,
      address: peripheral.address,
      rssi: peripheral.rssi,
    };
    if (argv.influxdb !== undefined) {
      const databaseName = `${argv.database}-${peripheral.uuid}`;
      influx = new InfluxDB({
        host: argv.influxdb,
        database: databaseName,
      });
      influx.getDatabaseNames().then((databases: string[]) => {
        if (databases.indexOf(databaseName) === -1) {
          influx.createDatabase(databaseName).then(() => {
            console.log('database is created:', databaseName);
          });
        }
      });
    }

    console.log(`Found microbit device (uuid=${device.uuid})`);
    peripheral.on('connect', () => {
      connectedPeripheral.add(peripheral);
      onPeripheralConnected(peripheral, device);
    });
    peripheral.on('disconnect', () => {
      console.log(`disconnected (uuid=${device.uuid})`);
      console.log('re-scanning');
      connectedPeripheral.delete(peripheral);
      noble.startScanning();
    });

    //noble.stopScanning();
    peripheral.connect();
  }
}

const argv = yargs.option('influxdb', {}).default('database', 'home-sensors')
  .argv;

noble.on('discover', onDiscover);

if (noble.state === 'poweredOn') {
  console.log('start scanning');
  noble.startScanning();
} else {
  console.log('Waiting for bluetooth state to change ...');
  noble.on('stateChange', (state: string) => {
    if (state === 'poweredOn') {
      console.log('start scanning');
      noble.startScanning();
    } else {
      noble.stopScanning();
    }
  });
}

process.on('exit', () => {
  noble.stopScanning();
  for (const peripheral of connectedPeripheral) {
    peripheral.disconnect();
  }
});
