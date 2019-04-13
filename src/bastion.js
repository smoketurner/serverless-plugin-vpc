const http = require('http');

const { PUBLIC_SUBNET } = require('./constants');

/**
 * Return the public IP
 *
 * @return {Promise}
 */
function getPublicIp() {
  return new Promise((resolve, reject) => {
    const options = {
      host: 'api.ipify.org',
      port: 80,
      path: '/',
    };
    http
      .get(options, res => {
        res.setEncoding('utf8');

        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });

        res.on('end', () => {
          resolve(body);
        });
      })
      .on('error', err => {
        reject(err);
      });
  });
}

/**
 * Build an EIP for the bastion host
 *
 * @return {Object}
 */
function buildBastionEIP({ name = 'BastionEIP' } = {}) {
  return {
    [name]: {
      Type: 'AWS::EC2::EIP',
      Properties: {
        Domain: 'vpc',
      },
    },
  };
}

/**
 * Build an IAM role for the bastion host
 *
 * @param {Object} params
 * @return {Object}
 */
function buildBastionIamRole({ name = 'BastionIamRole' } = {}) {
  return {
    [name]: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: 'ec2.amazonaws.com',
              },
              Action: 'sts:AssumeRole',
            },
          ],
        },
        Policies: [
          {
            PolicyName: 'AllowEIPAssociation',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Action: 'ec2:AssociateAddress',
                  Resource: '*',
                  Effect: 'Allow',
                },
              ],
            },
          },
        ],
        ManagedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM'],
      },
    },
  };
}

/**
 * Build an instance profile for the bastion host
 *
 * @param {Object} params
 * @return {Object}
 */
function buildBastionInstanceProfile({ name = 'BastionInstanceProfile' } = {}) {
  return {
    [name]: {
      Type: 'AWS::IAM::InstanceProfile',
      Properties: {
        Roles: [
          {
            Ref: 'BastionIamRole',
          },
        ],
      },
    },
  };
}

/**
 * Build the auto-scaling group launch configuration for the bastion host
 *
 * @param {String} keyPairName Existing key pair name
 * @param {Object} params
 * @return {Object}
 */
function buildBastionLaunchConfiguration(
  keyPairName,
  { name = 'BastionLaunchConfiguration' } = {},
) {
  return {
    [name]: {
      Type: 'AWS::AutoScaling::LaunchConfiguration',
      Properties: {
        AssociatePublicIpAddress: true,
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
        KeyName: keyPairName,
        ImageId: {
          Ref: 'LatestAmiId',
        },
        InstanceMonitoring: false,
        IamInstanceProfile: {
          Ref: 'BastionInstanceProfile',
        },
        InstanceType: 't2.micro',
        SecurityGroups: [
          {
            Ref: 'BastionSecurityGroup',
          },
        ],
        SpotPrice: '0.0116', // On-Demand price of t2.micro in us-east-1
        // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-helper-scripts-reference.html
        UserData: {
          'Fn::Base64': {
            'Fn::Join': [
              '',
              [
                '#!/bin/bash -xe\n',
                '/usr/bin/yum update -y\n',
                '/usr/bin/yum install -y aws-cfn-bootstrap\n',
                'EIP_ALLOCATION_ID=',
                { 'Fn::GetAtt': ['BastionEIP', 'AllocationId'] },
                '\n',
                'INSTANCE_ID=`/usr/bin/curl -sq http://169.254.169.254/latest/meta-data/instance-id`\n',
                // eslint-disable-next-line no-template-curly-in-string
                '/usr/bin/aws ec2 associate-address --instance-id ${INSTANCE_ID} --allocation-id ${EIP_ALLOCATION_ID} --region ',
                { Ref: 'AWS::Region' },
                '\n',
                '/opt/aws/bin/cfn-signal --exit-code 0 --stack ',
                { Ref: 'AWS::StackName' },
                ' --resource BastionAutoScalingGroup ',
                ' --region ',
                { Ref: 'AWS::Region' },
                '\n',
              ],
            ],
          },
        },
      },
    },
  };
}

/**
 * Build the bastion host auto-scaling group
 *
 * @param {Number} numZones Number of availability zones
 * @param {Object} params
 * @return {Object}
 */
function buildBastionAutoScalingGroup(numZones = 0, { name = 'BastionAutoScalingGroup' } = {}) {
  if (numZones < 1) {
    return {};
  }

  const zones = [];
  for (let i = 1; i <= numZones; i += 1) {
    zones.push({ Ref: `${PUBLIC_SUBNET}Subnet${i}` });
  }

  return {
    [name]: {
      Type: 'AWS::AutoScaling::AutoScalingGroup',
      CreationPolicy: {
        ResourceSignal: {
          Count: 1,
          Timeout: 'PT10M',
        },
      },
      Properties: {
        LaunchConfigurationName: {
          Ref: 'BastionLaunchConfiguration',
        },
        VPCZoneIdentifier: zones,
        MinSize: 1,
        MaxSize: 1,
        Cooldown: '300',
        DesiredCapacity: 1,
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
                  'bastion',
                ],
              ],
            },
            PropagateAtLaunch: true,
          },
        ],
      },
    },
  };
}

/**
 * Build a SecurityGroup to be used by the bastion host
 *
 * @param {String} sourceIp source IP address
 * @param {Object} params
 * @return {Object}
 */
function buildBastionSecurityGroup(sourceIp = '0.0.0.0/0', { name = 'BastionSecurityGroup' } = {}) {
  return {
    [name]: {
      Type: 'AWS::EC2::SecurityGroup',
      Properties: {
        GroupDescription: 'Bastion Host',
        VpcId: {
          Ref: 'VPC',
        },
        SecurityGroupIngress: [
          {
            Description: 'Allow inbound SSH access to the bastion host',
            IpProtocol: 'tcp',
            FromPort: 22,
            ToPort: 22,
            CidrIp: sourceIp,
          },
          {
            Description: 'Allow inbound ICMP to the bastion host',
            IpProtocol: 'icmp',
            FromPort: -1,
            ToPort: -1,
            CidrIp: sourceIp,
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
                  'bastion',
                ],
              ],
            },
          },
        ],
      },
    },
  };
}

/**
 * Build the bastion host
 *
 * @param {String} keyPairName Existing key pair name
 * @param {Number} numZones Number of availability zones
 * @return {Object}
 */
async function buildBastion(keyPairName, numZones = 0) {
  if (numZones < 1) {
    return {};
  }
  let publicIp = '0.0.0.0/0';
  try {
    publicIp = await getPublicIp();
  } catch (err) {
    console.error('Unable to discover public IP address:', err);
  }

  return Object.assign(
    {},
    buildBastionEIP(),
    buildBastionIamRole(),
    buildBastionInstanceProfile(),
    buildBastionSecurityGroup(`${publicIp}/32`),
    buildBastionLaunchConfiguration(keyPairName),
    buildBastionAutoScalingGroup(numZones),
  );
}

module.exports = {
  getPublicIp,
  buildBastion,
  buildBastionAutoScalingGroup,
  buildBastionEIP,
  buildBastionIamRole,
  buildBastionInstanceProfile,
  buildBastionLaunchConfiguration,
  buildBastionSecurityGroup,
};
