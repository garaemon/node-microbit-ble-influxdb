import { IncomingWebhook } from '@slack/client';
import * as BBCMicrobit from 'bbc-microbit';
import { InfluxDB } from 'influx';
import * as yargs from 'yargs';

let influx: InfluxDB = null;

const argv = yargs.option('influxdb', {}).default('database', 'home-sensors')
  .argv;

const SAMPLING_PERIOD_MSEC = 10000; // ms

async function notifySlack(text: string) {
  // SLACKBOT_INCOMING_WEBHOOK environmetal variable is required
  if (
    !process.env.SLACKBOT_INCOMING_WEBHOOK === undefined &&
    process.env.SLACKBOT_INCOMING_WEBHOOK !== ''
  ) {
    return;
  }
  const web = new IncomingWebhook(process.env.SLACKBOT_INCOMING_WEBHOOK);
  try {
    await web.send(text);
    console.log('Done to communicate with slack');
  } catch (e) {
    console.error('Failed to communicate with slack', e);
  }
}

function discover() {
  console.log('Scanning for microbit');
  BBCMicrobit.discover((microbit: BBCMicrobit.Microbit) => {
    console.log(
      '\tdiscovered microbit: id = %s, address = %s',
      microbit.id,
      microbit.address,
    );
    if (argv.influxdb !== undefined) {
      const databaseName = `${argv.database}-${microbit.id}`;
      influx = new InfluxDB({
        host: argv.influxdb as string,
        database: databaseName,
      });
      influx
        .getDatabaseNames()
        .then(async (databases: string[]) => {
          if (databases.indexOf(databaseName) === -1) {
            await influx.createDatabase(databaseName).then(() => {
              console.log('database is created:', databaseName);
            });
          }
        })
        .catch(() => {
          console.error('Failed to get and create db');
        });
    }
    microbit.on('disconnect', () => {
      console.log('\tmicrobit disconnected!');
      notifySlack('disconnected from microbit');
      // process.exit(0);
      discover();
    });
    let counter: number = 0;
    microbit.on('temperatureChange', (temperature: number) => {
      if (counter % 100 === 0) {
        console.log('data', temperature);
        counter = 0;
      }
      counter = counter + 1;
      if (influx !== null) {
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
            if (err.message === 'No host available') {
              console.error('no influxdb is ready...');
            } else {
              console.error('error saving data to InfluxDB', err);
            }
          });
      }
    });

    console.log('connecting to microbit');
    microbit.connectAndSetUp(() => {
      console.log('\tconnected to microbit');
      notifySlack('connected with microbit');
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
}

discover();
