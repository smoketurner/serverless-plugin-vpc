const AWS = require('aws-sdk');
const nock = require('nock');

const Serverless = require('serverless');
const AwsProvider = require('serverless/lib/plugins/aws/provider');
const ServerlessVpcPlugin = require('../src/index');

describe('ServerlessVpcPlugin', () => {
  let serverless;
  let plugin;

  beforeEach(() => {
    nock.disableNetConnect();
    nock.recorder.rec();

    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    serverless.cli = new serverless.classes.CLI();

    const provider = new AwsProvider(serverless, options);
    provider.sdk.config.logger = console;

    provider.cachedCredentials = {
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    };

    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
      Parameters: {},
    };

    plugin = new ServerlessVpcPlugin(serverless);
  });

  afterEach(() => {
    // AWS.restore();
    AWS.clearAllMocks();
    nock.restore();
    nock.cleanAll();
  });

  describe('#constructor', () => {
    it('should initialize without options', () => {
      expect(plugin.serverless).toBeInstanceOf(Serverless);
      expect(plugin.options).toEqual({});
      expect.assertions(2);
    });

    it('should initialize with empty options', () => {
      const newPlugin = new ServerlessVpcPlugin(serverless, {});
      expect(newPlugin.serverless).toBeInstanceOf(Serverless);
      expect(newPlugin.options).toEqual({});
      expect.assertions(2);
    });

    it('should initialize with custom options', () => {
      const options = {
        zones: ['us-west-2a'],
        services: [],
      };
      const newPlugin = new ServerlessVpcPlugin(serverless, options);
      expect(newPlugin.serverless).toBeInstanceOf(Serverless);
      expect(newPlugin.options).toEqual(options);
      expect.assertions(2);
    });
  });

  describe('#afterInitialize', () => {
    it('should require a bastion key name', async () => {
      serverless.service.custom.vpcConfig = {
        createBastionHost: true,
      };

      await expect(plugin.afterInitialize()).rejects.toThrow(
        'bastionHostKeyName must be provided if createBastionHost is true',
      );
      expect.assertions(1);
    });

    it('createNatGateway should be either boolean or a number', async () => {
      serverless.service.custom.vpcConfig = {
        createNatGateway: 'hello',
        zones: ['us-east-1a'],
        services: [],
      };

      await expect(plugin.afterInitialize()).rejects.toThrow(
        'createNatGateway must be either a boolean or a number',
      );
      expect.assertions(1);
    });

    it('should not allow NAT instance and NAT gateway as boolean', async () => {
      serverless.service.custom.vpcConfig = {
        createNatGateway: true,
        createNatInstance: true,
      };

      await expect(plugin.afterInitialize()).rejects.toThrow(
        'Please choose either createNatGateway or createNatInstance, not both',
      );
      expect.assertions(1);
    });

    it('should not allow NAT instance and NAT gateway as number', async () => {
      serverless.service.custom.vpcConfig = {
        createNatGateway: 3,
        createNatInstance: true,
      };

      await expect(plugin.afterInitialize()).rejects.toThrow(
        'Please choose either createNatGateway or createNatInstance, not both',
      );
      expect.assertions(1);
    });

    it('should discover available zones', async () => {
      const mock = AWS.spyOnPromise('EC2', 'describeAvailabilityZones', {
        AvailabilityZones: [
          {
            State: 'available',
            ZoneName: 'us-east-1a',
          },
        ],
      });

      serverless.service.custom.vpcConfig = {
        services: [],
      };

      const actual = await plugin.afterInitialize();
      expect(actual).toBeUndefined();

      expect(mock).toHaveBeenCalledWith({
        Filters: [
          {
            Name: 'region-name',
            Values: ['us-east-1'],
          },
          {
            Name: 'opt-in-status',
            Values: ['opt-in-not-required'],
          },
          {
            Name: 'state',
            Values: ['available'],
          },
        ],
      });
      expect.assertions(2);
    });

    it('rejects invalid subnet groups', async () => {
      serverless.service.custom.vpcConfig = {
        zones: ['us-east-1a', 'us-east-1b'],
        subnetGroups: ['invalid'],
        services: [],
      };

      await expect(plugin.afterInitialize()).rejects.toThrow(
        'WARNING: Invalid subnetGroups option. Valid options: rds, redshift, elasticache, dax',
      );
      expect.assertions(1);
    });
  });

  describe('#getZonesPerRegion', () => {
    it('returns the zones in a region', async () => {
      const mock = AWS.spyOnPromise('EC2', 'describeAvailabilityZones', {
        AvailabilityZones: [
          {
            State: 'available',
            ZoneName: 'us-east-1b',
          },
          {
            State: 'available',
            ZoneName: 'us-east-1a',
          },
        ],
      });

      const actual = await plugin.getZonesPerRegion('us-east-1');

      const expected = ['us-east-1a', 'us-east-1b'];

      expect(mock).toHaveBeenCalledWith({
        Filters: [
          {
            Name: 'region-name',
            Values: ['us-east-1'],
          },
          {
            Name: 'opt-in-status',
            Values: ['opt-in-not-required'],
          },
          {
            Name: 'state',
            Values: ['available'],
          },
        ],
      });
      expect(actual).toEqual(expected);
      expect.assertions(2);
    });
  });

  describe('#getVpcEndpointServicesPerRegion', () => {
    it('returns the endpoint services in a region', async () => {
      const mock = AWS.spyOnPromise('EC2', 'describeVpcEndpointServices', {
        ServiceNames: [
          'com.amazonaws.us-east-1.dynamodb',
          'com.amazonaws.us-east-1.s3',
          'com.amazonaws.us-east-1.kms',
          'com.amazonaws.us-east-1.kinesis-streams',
        ],
      });

      const actual = await plugin.getVpcEndpointServicesPerRegion('us-east-1');

      const expected = [
        'com.amazonaws.us-east-1.dynamodb',
        'com.amazonaws.us-east-1.kinesis-streams',
        'com.amazonaws.us-east-1.kms',
        'com.amazonaws.us-east-1.s3',
      ];

      expect(mock).toHaveBeenCalledWith({ MaxResults: 1000 });
      expect(actual).toEqual(expected);
      expect.assertions(2);
    });
  });

  describe('#getImagesByName', () => {
    it('returns an AMI image by name', async () => {
      const mock = AWS.spyOnPromise('EC2', 'describeImages', {
        Images: [
          {
            ImageId: 'ami-test',
            CreationDate: '2019-04-12T00:00:00Z',
          },
        ],
      });

      const actual = await plugin.getImagesByName('test');
      expect(actual).toEqual(['ami-test']);
      expect(mock).toHaveBeenCalledWith({
        Filters: [
          {
            Name: 'architecture',
            Values: ['x86_64'],
          },
          {
            Name: 'image-type',
            Values: ['machine'],
          },
          {
            Name: 'is-public',
            Values: ['true'],
          },
          {
            Name: 'name',
            Values: ['test'],
          },
          {
            Name: 'state',
            Values: ['available'],
          },
          {
            Name: 'root-device-type',
            Values: ['ebs'],
          },
          {
            Name: 'virtualization-type',
            Values: ['hvm'],
          },
        ],
        Owners: ['amazon'],
      });
      expect.assertions(2);
    });
  });

  describe('#validateServices', () => {
    it('returns validated services', async () => {
      const mock = AWS.spyOnPromise('EC2', 'describeVpcEndpointServices', {
        ServiceNames: [
          'com.amazonaws.us-east-1.dynamodb',
          'com.amazonaws.us-east-1.s3',
          'com.amazonaws.us-east-1.kms',
          'com.amazonaws.us-east-1.kinesis-streams',
        ],
      });

      const actual = await plugin.validateServices('us-east-1', ['blah']);

      const expected = ['com.amazonaws.us-east-1.blah'];

      expect(actual).toEqual(expected);
      expect(mock).toHaveBeenCalledWith({ MaxResults: 1000 });
      expect.assertions(2);
    });
  });

  describe('#getPrefixLists', () => {
    it('returns the prefix lists', async () => {
      const mock = AWS.spyOnPromise('EC2', 'describeManagedPrefixLists', {
        PrefixLists: [
          {
            PrefixListId: 'pl-02cd2c6b',
            AddressFamily: 'IPv4',
            State: 'create-complete',
            PrefixListArn: 'arn:aws:ec2:us-east-1:aws:prefix-list/pl-02cd2c6b',
            PrefixListName: 'com.amazonaws.us-east-1.dynamodb',
            Tags: [],
            OwnerId: 'AWS',
          },
          {
            PrefixListId: 'pl-63a5400a',
            AddressFamily: 'IPv4',
            State: 'create-complete',
            PrefixListArn: 'arn:aws:ec2:us-east-1:aws:prefix-list/pl-63a5400a',
            PrefixListName: 'com.amazonaws.us-east-1.s3',
            Tags: [],
            OwnerId: 'AWS',
          },
        ],
      });

      const expected = {
        s3: 'pl-63a5400a',
        dynamodb: 'pl-02cd2c6b',
      };

      const actual = await plugin.getPrefixLists();
      expect(actual).toEqual(expected);
      expect(mock).toHaveBeenCalledWith({
        Filters: [
          {
            Name: 'owner-id',
            Values: ['AWS'],
          },
        ],
      });
      expect.assertions(2);
    });
  });
});
