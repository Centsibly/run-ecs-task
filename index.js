const core = require('@actions/core');
const aws = require('aws-sdk');

const WAIT_DEFAULT_DELAY_SEC = 15;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForTasks(tasks, attemptsLeft) {
  core.info(`Waiting for tasks ${tasks} attemptsleft ${attemptsLeft}`)
  if (attemptsLeft === 0) {
    return 0
  } else {
    const description = await ecs.describeTasks({
      tasks: tasks,
    }).promise();

    core.info(`Got data about task ${JSON.stringify(description)}`)
    if (description.tasks.some(t => t.stoppingAt === null || t.stoppingAt === undefined)) {
      await sleep(10000)
      return waitForTasks(tasks, attemptsLeft - 1)
    } else {
      return 0
    }

  }
}
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
  core.debug(`Waiting for the task to finish. Will wait for ${waitForMinutes} minutes`);
  const maxAttempts = (waitForMinutes * 60) / WAIT_DEFAULT_DELAY_SEC;
  await waitForTasks(taskInfo.tasks.map(t => t.taskArn.match(/\/([^\/]*)$/)[1]), maxAttempts)
}

async function run() {
  try {
    const ecs = new aws.ECS({
      customUserAgent: 'centsibly-run-task-for-github-actions'
    });

    // Get inputs
    const clusterName = core.getInput('cluster', { required: true });
    const task = core.getInput('task', { required: true });
    const subnets = core.getInput('subnets', { required: true }).split(",");
    const securityGroups = core.getInput('securityGroups', { required: true }).split(",");
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