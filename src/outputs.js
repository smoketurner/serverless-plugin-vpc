const { VALID_SUBNET_GROUPS } = require('./constants');

/**
 * Append subnet groups to output
 *
 * @param {Array<String>} subnetGroups
 * @param {Object} outputs
 */
function appendSubnets(subnetGroups, outputs) {
  if (subnetGroups) {
    const typesToNames = {
      rds: 'RDSSubnetGroup',
      redshift: 'ElastiCacheSubnetGroup',
      elasticache: 'RedshiftSubnetGroup',
      dax: 'DAXSubnetGroup',
    };

    const subnetOutputs = subnetGroups.map(subnetGroup => ({
      [typesToNames[subnetGroup]]: {
        Description: `Subnet Group for ${subnetGroup}`,
        Value: { Ref: typesToNames[subnetGroup] },
      },
    }));

    Object.assign(outputs, ...subnetOutputs);
  }
}

/**
 * Append bastion host to output
 *
 * @param {Boolean} createBastionHost
 * @param {Object} outputs
 */
function appendBastionHost(createBastionHost, outputs) {
  if (createBastionHost) {
    // eslint-disable-next-line no-param-reassign
    outputs.BastionSSHUser = {
      Description: 'SSH username for the Bastion host',
      Value: 'ec2-user',
    };
    // eslint-disable-next-line no-param-reassign
    outputs.BastionEIP = {
      Description: 'Public IP of Bastion host',
      Value: {
        Ref: 'BastionEIP',
      },
    };
  }
}

/**
 * Append export outputs
 *
 * @param {Boolean} exportOutputs
 * @param {Object} outputs
 */
function appendExports(exportOutputs, outputs) {
  if (exportOutputs) {
    Object.entries(outputs).forEach(([name, value]) => {
      // eslint-disable-next-line no-param-reassign
      value.Export = {
        Name: {
          'Fn::Join': ['-', ["Fn::Ref 'AWS::StackName'", name]],
        },
      };
    });
  }
}

/**
 * Build CloudFormation Outputs on common resources
 *
 * @param {Boolean} createBastionHost
 * @param {Array<String>} subnetGroups
 * @param {Boolean} exportOutputs
 * @return {Object}
 */

function buildOutputs(
  createBastionHost = false,
  subnetGroups = VALID_SUBNET_GROUPS,
  exportOutputs = false,
) {
  const outputs = {
    VPC: {
      Description: 'VPC logical resource ID',
      Value: {
        Ref: 'VPC',
      },
    },
    LambdaExecutionSecurityGroupId: {
      Description:
        'Security Group logical resource ID that the Lambda functions use when executing within the VPC',
      Value: {
        Ref: 'LambdaExecutionSecurityGroup',
      },
    },
  };

  appendSubnets(subnetGroups, outputs);

  appendBastionHost(createBastionHost, outputs);

  appendExports(exportOutputs, outputs);

  return outputs;
}

module.exports = {
  buildOutputs,
};
