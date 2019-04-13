const { buildNatInstance, buildNatSecurityGroup } = require('../src/nat_instance');

describe('nat_instance', () => {
  describe('#buildNatSecurityGroup', () => {
    it('builds a security group', () => {
      const expected = {
        NatSecurityGroup: {
          Type: 'AWS::EC2::SecurityGroup',
          Properties: {
            GroupDescription: 'NAT Instance',
            VpcId: {
              Ref: 'VPC',
            },
            SecurityGroupEgress: [
              {
                Description: 'Allow outbound HTTP access to the Internet',
                IpProtocol: 'tcp',
                FromPort: 80,
                ToPort: 80,
                CidrIp: '0.0.0.0/0',
              },
              {
                Description: 'Allow outbound HTTPS access to the Internet',
                IpProtocol: 'tcp',
                FromPort: 443,
                ToPort: 443,
                CidrIp: '0.0.0.0/0',
              },
            ],
            SecurityGroupIngress: [
              {
                Description: 'Allow inbound HTTP traffic from AppSubnet1',
                IpProtocol: 'tcp',
                FromPort: 80,
                ToPort: 80,
                CidrIp: '10.0.0.0/21',
              },
              {
                Description: 'Allow inbound HTTPS traffic from AppSubnet1',
                IpProtocol: 'tcp',
                FromPort: 443,
                ToPort: 443,
                CidrIp: '10.0.0.0/21',
              },
              {
                Description: 'Allow inbound HTTP traffic from AppSubnet2',
                IpProtocol: 'tcp',
                FromPort: 80,
                ToPort: 80,
                CidrIp: '10.0.6.0/21',
              },
              {
                Description: 'Allow inbound HTTPS traffic from AppSubnet2',
                IpProtocol: 'tcp',
                FromPort: 443,
                ToPort: 443,
                CidrIp: '10.0.6.0/21',
              },
            ],
            Tags: [
              {
                Key: 'Name',
                Value: {
                  'Fn::Join': [
                    '-',
                    [
                      {
                        Ref: 'AWS::StackName',
                      },
                      'nat',
                    ],
                  ],
                },
              },
            ],
          },
        },
      };

      const actual = buildNatSecurityGroup(['10.0.0.0/21', '10.0.6.0/21']);
      expect(actual).toEqual(expected);
      expect.assertions(1);
    });
  });

  describe('#buildNatInstance', () => {
    it('builds an EC2 instance', () => {
      const expected = {
        NatInstance: {
          Type: 'AWS::EC2::Instance',
          DependsOn: 'InternetGatewayAttachment',
          Properties: {
            AvailabilityZone: {
              'Fn::Select': ['0', ['us-east-1a', 'us-east-1b']],
            },
            BlockDeviceMappings: [
              {
                DeviceName: '/dev/xvda',
                Ebs: {
                  VolumeSize: 10,
                  VolumeType: 'gp2',
                  DeleteOnTermination: true,
                },
              },
            ],
            ImageId: 'ami-00a9d4a05375b2763',
            InstanceType: 't2.micro',
            Monitoring: false,
            NetworkInterfaces: [
              {
                AssociatePublicIpAddress: true,
                DeleteOnTermination: true,
                Description: 'eth0',
                DeviceIndex: '0',
                GroupSet: [
                  {
                    Ref: 'NatSecurityGroup',
                  },
                ],
                SubnetId: {
                  Ref: 'PublicSubnet1',
                },
              },
            ],
            SourceDestCheck: false,
            Tags: [
              {
                Key: 'Name',
                Value: {
                  'Fn::Join': [
                    '-',
                    [
                      {
                        Ref: 'AWS::StackName',
                      },
                      'nat',
                    ],
                  ],
                },
              },
            ],
          },
        },
      };

      const imageId = 'ami-00a9d4a05375b2763';

      const actual = buildNatInstance(imageId, ['us-east-1a', 'us-east-1b']);
      expect(actual).toEqual(expected);
      expect.assertions(1);
    });
  });
});
