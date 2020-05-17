const core = require('@actions/core');
const aws = require('aws-sdk');

const WAIT_DEFAULT_DELAY_SEC = 15;

// Deploy to a service that uses the 'ECS' deployment controller
async function runTask(ecs, clusterName, taskName, waitForMinutes, subnets, securityGroups) {
  core.debug('Running the task');
  const taskInfo = await ecs.runTask({
    cluster: clusterName,
    taskDefinition: taskName,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: subnets,
        securityGroups: securityGroups,
        assignPublicIp: 'ENABLED'
      }
    }
  }).promise();
  core.info(`Task started.`);

  // Wait for service stability
  core.debug(`Waiting for the service to become stable. Will wait for ${waitForMinutes} minutes`);
  const maxAttempts = (waitForMinutes * 60) / WAIT_DEFAULT_DELAY_SEC;
  await ecs.waitFor('tasksStopped', {
    tasks: [taskInfo.tasks.map(t => t.taskArn)],
    cluster: clusterName,
    $waiter: {
      delay: WAIT_DEFAULT_DELAY_SEC,
      maxAttempts: maxAttempts
    }
  }).promise();
}

async function run() {
  try {
    const ecs = new aws.ECS({
      customUserAgent: 'centsibly-run-task-for-github-actions'
    });

    // Get inputs
    const clusterName = core.getInput('cluster', { required: true});
    const task = core.getInput('task', { required: true});
    const subnets = core.getInput('subnets', { required: true}).split(",");
    const securityGroups = core.getInput('securityGroups', { required: true}).split(",");
    let waitForMinutes = 30 

    await runTask(ecs, clusterName, task, waitForMinutes, subnets, securityGroups);
  }
  catch (error) {
    core.setFailed(error.message);
    core.debug(error.stack);
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
    run();
}