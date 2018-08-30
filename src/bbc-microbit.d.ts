declare module 'bbc-microbit' {
  export class Microbit {
    public id: string;
    public address: string;

    public on(event: 'temperatureChange', callback: (temperature: number) => void): void;
    public on(event: 'disconnect', callback: () => void): void;
    public connectAndSetUp(callback: () => void): void;
    public writeTemperaturePeriod(periodMsec: number, callback: () => void): void;
    public subscribeTemperature(callbck: () => void): void;
  }

  function discover(callback: (microbit: Microbit) => void): void;
}
