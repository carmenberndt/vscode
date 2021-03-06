type ConnectionAttributes = {
  driverUrl: string;
  driverUrlWithSsh: string;
  driverOptions: any;
  instanceId: string;
  sshTunnelOptions: any;
};

export type ConnectionModelType = {
  appname: string;
  port: number;

  getAttributes(options: object): ConnectionAttributes;
  disconnect(callback: (n: Error | undefined) => void): void;
};
