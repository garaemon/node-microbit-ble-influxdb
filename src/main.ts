import * as BBCMicrobit from 'bbc-microbit';
import * as yargs from 'yargs';
import { InfluxDB } from 'influx';

let influx: InfluxDB = null;

const argv = yargs.option('influxdb', {}).default('database', 'home-sensors')
  .argv;

const SAMPLING_PERIOD_MSEC = 160; // ms
console.log('Scanning for microbit');

BBCMicrobit.discover(microbit => {
  console.log(
    '\tdiscovered microbit: id = %s, address = %s',
    microbit.id,
    microbit.address,
  );
  if (argv.influxdb !== undefined) {
    const databaseName = `${argv.database}-${microbit.id}`;
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
  microbit.on('disconnect', () => {
    console.log('\tmicrobit disconnected!');
    process.exit(0);
  });
  let counter: number = 0;
  microbit.on('temperatureChange', (temperature: number) => {
    if (counter % 100 === 0) {
      console.log('data', temperature);
      counter = 0;
    }
    ++counter;
    if (influx) {
      influx
        .writePoints([
          {
            measurement: 'temperature',
            fields: {
              data: temperature,
            },
          },
        ])
        .catch((err: Error) => {
          console.error('error saving data to InfluxDB', err);
        });
    }
  });

  console.log('connecting to microbit');
  microbit.connectAndSetUp(() => {
    console.log('\tconnected to microbit');

    console.log('setting temperature period to %d ms', SAMPLING_PERIOD_MSEC);
    microbit.writeTemperaturePeriod(SAMPLING_PERIOD_MSEC, () => {
      console.log('\ttemperature period set');

      console.log('subscribing to temperature');
      microbit.subscribeTemperature(() => {
        console.log('\tsubscribed to temperature');
      });
    });
  });
});
