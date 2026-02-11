/**
 * Agent Swarm System
 * 
 * Enables multi-agent collaboration through:
 * - Agent orchestration and coordination
 * - Task delegation with priority queues
 * - Result aggregation
 * - Load balancing
 */

import { logger } from './logger';
import { runOllamaAgent } from './ollama-runner';
import { runContainerAgent } from './container-runner';
import { CONTAINER_RUNTIME, ENABLE_AGENT_SWARMS, MAX_SWARM_SIZE } from './config';

export enum AgentRole {
  ORCHESTRATOR = 'orchestrator',
  WORKER = 'worker',
  SPECIALIST = 'specialist',
}

export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export interface SwarmTask {
  id: string;
  description: string;
  priority: TaskPriority;
  assignedAgent?: string;
  result?: any;
  error?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export interface Agent {
  id: string;
  role: AgentRole;
  status: 'idle' | 'busy' | 'offline';
  currentTask?: string;
  tasksCompleted: number;
  groupFolder: string;
}

export class AgentSwarm {
  private agents: Map<string, Agent> = new Map();
  private taskQueue: SwarmTask[] = [];
  private maxAgents: number;
  private enabled: boolean;

  constructor(maxAgents: number = MAX_SWARM_SIZE) {
    this.maxAgents = maxAgents;
    this.enabled = ENABLE_AGENT_SWARMS;
    
    if (!this.enabled) {
      logger.info('Agent swarms disabled');
    }
  }

  /**
   * Register a new agent in the swarm
   */
  registerAgent(id: string, role: AgentRole, groupFolder: string): void {
    if (!this.enabled) {
      throw new Error('Agent swarms are disabled');
    }

    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Maximum swarm size reached: ${this.maxAgents}`);
    }

    const agent: Agent = {
      id,
      role,
      status: 'idle',
      tasksCompleted: 0,
      groupFolder,
    };

    this.agents.set(id, agent);
    logger.info({ agentId: id, role, groupFolder }, 'Agent registered in swarm');
  }

  /**
   * Deregister an agent from the swarm
   */
  deregisterAgent(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) {
      logger.warn({ agentId: id }, 'Agent not found for deregistration');
      return;
    }

    if (agent.status === 'busy') {
      logger.warn({ agentId: id }, 'Deregistering busy agent - task may fail');
    }

    this.agents.delete(id);
    logger.info({ agentId: id }, 'Agent deregistered from swarm');
  }

  /**
   * Submit a task to the swarm
   */
  submitTask(description: string, priority: TaskPriority = TaskPriority.NORMAL): string {
    if (!this.enabled) {
      throw new Error('Agent swarms are disabled');
    }

    const task: SwarmTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description,
      priority,
      status: 'pending',
      createdAt: new Date(),
    };

    this.taskQueue.push(task);
    this.taskQueue.sort((a, b) => b.priority - a.priority); // Higher priority first

    logger.info(
      { taskId: task.id, priority, queueSize: this.taskQueue.length },
      'Task submitted to swarm',
    );

    // Try to assign immediately
    this.assignTasks();

    return task.id;
  }

  /**
   * Assign pending tasks to idle agents
   */
  private assignTasks(): void {
    const pendingTasks = this.taskQueue.filter((t) => t.status === 'pending');
    const idleAgents = Array.from(this.agents.values()).filter((a) => a.status === 'idle');

    if (pendingTasks.length === 0 || idleAgents.length === 0) {
      return;
    }

    for (let i = 0; i < Math.min(pendingTasks.length, idleAgents.length); i++) {
      const task = pendingTasks[i];
      const agent = idleAgents[i];

      task.assignedAgent = agent.id;
      task.status = 'processing';
      agent.status = 'busy';
      agent.currentTask = task.id;

      logger.info(
        { taskId: task.id, agentId: agent.id },
        'Task assigned to agent',
      );

      // Execute task asynchronously
      this.executeTask(task, agent).catch((error) => {
        logger.error({ taskId: task.id, agentId: agent.id, error }, 'Task execution failed');
        task.status = 'failed';
        task.error = error.message;
        agent.status = 'idle';
        agent.currentTask = undefined;
      });
    }
  }

  /**
   * Execute a task on an agent
   */
  private async executeTask(task: SwarmTask, agent: Agent): Promise<void> {
    try {
      logger.debug({ taskId: task.id, agentId: agent.id }, 'Executing task');

      // Create a group object for the agent
      const group = {
        name: agent.groupFolder,
        folder: agent.groupFolder,
        requiresTrigger: false,
      };

      const input = {
        prompt: task.description,
        groupFolder: agent.groupFolder,
        chatJid: `swarm-${agent.id}`,
        isMain: agent.groupFolder === 'main',
      };

      let output;
      
      if (CONTAINER_RUNTIME === 'none') {
        // Direct execution
        output = await runOllamaAgent(group, input);
      } else {
        // Container execution
        output = await runContainerAgent(group, input);
      }

      if (output.status === 'success') {
        task.result = output.result;
        task.status = 'completed';
      } else {
        task.status = 'failed';
        task.error = output.error || 'Unknown error';
      }

      task.completedAt = new Date();
      agent.status = 'idle';
      agent.currentTask = undefined;
      
      if (task.status === 'completed') {
        agent.tasksCompleted++;
      }

      logger.info(
        { taskId: task.id, agentId: agent.id, duration: task.completedAt.getTime() - task.createdAt.getTime() },
        'Task completed',
      );

      // Try to assign more tasks
      this.assignTasks();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): SwarmTask | undefined {
    return this.taskQueue.find((t) => t.id === taskId);
  }

  /**
   * Wait for a task to complete
   */
  async waitForTask(taskId: string, timeout: number = 300000): Promise<SwarmTask> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const task = this.getTaskStatus(taskId);
      
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      if (task.status === 'completed') {
        return task;
      }

      if (task.status === 'failed') {
        throw new Error(`Task failed: ${task.error}`);
      }

      // Wait a bit before checking again
      await new Promise<void>((resolve) => global.setTimeout(resolve, 100));
    }

    throw new Error(`Task timeout: ${taskId}`);
  }

  /**
   * Delegate a complex task to multiple agents
   */
  async delegateTask(
    description: string,
    subtasks: string[],
    groupFolder: string,
  ): Promise<string[]> {
    if (!this.enabled) {
      throw new Error('Agent swarms are disabled');
    }

    logger.info(
      { description, subtaskCount: subtasks.length, groupFolder },
      'Delegating complex task',
    );

    // Create orchestrator agent
    const orchestratorId = `orchestrator-${Date.now()}`;
    this.registerAgent(orchestratorId, AgentRole.ORCHESTRATOR, groupFolder);

    try {
      // Submit all subtasks
      const taskIds = subtasks.map((subtask) =>
        this.submitTask(subtask, TaskPriority.HIGH),
      );

      // Wait for all subtasks to complete
      const results = await Promise.all(
        taskIds.map((taskId) => this.waitForTask(taskId)),
      );

      // Aggregate results
      const aggregatedResults = results.map((task) => task.result);

      logger.info(
        { description, subtaskCount: subtasks.length, resultsCount: aggregatedResults.length },
        'Complex task completed',
      );

      return aggregatedResults;
    } finally {
      // Clean up orchestrator
      this.deregisterAgent(orchestratorId);
    }
  }

  /**
   * Get swarm statistics
   */
  getStats(): {
    totalAgents: number;
    idleAgents: number;
    busyAgents: number;
    pendingTasks: number;
    completedTasks: number;
    failedTasks: number;
  } {
    const agents = Array.from(this.agents.values());
    
    return {
      totalAgents: agents.length,
      idleAgents: agents.filter((a) => a.status === 'idle').length,
      busyAgents: agents.filter((a) => a.status === 'busy').length,
      pendingTasks: this.taskQueue.filter((t) => t.status === 'pending').length,
      completedTasks: this.taskQueue.filter((t) => t.status === 'completed').length,
      failedTasks: this.taskQueue.filter((t) => t.status === 'failed').length,
    };
  }

  /**
   * Get load balancing recommendation
   */
  getLoadBalancedAgent(): Agent | undefined {
    const idleAgents = Array.from(this.agents.values()).filter((a) => a.status === 'idle');
    
    if (idleAgents.length === 0) {
      return undefined;
    }

    // Return agent with least completed tasks (load balancing)
    return idleAgents.reduce((min, agent) =>
      agent.tasksCompleted < min.tasksCompleted ? agent : min,
    );
  }

  /**
   * Shutdown the swarm gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down agent swarm...');

    // Wait for all busy agents to complete
    const busyAgents = Array.from(this.agents.values()).filter((a) => a.status === 'busy');
    
    if (busyAgents.length > 0) {
      logger.info({ busyAgentCount: busyAgents.length }, 'Waiting for busy agents to complete');

      // Wait up to 60 seconds for agents to finish
      const maxWait = 60000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const stillBusy = Array.from(this.agents.values()).filter((a) => a.status === 'busy');
        if (stillBusy.length === 0) {
          break;
        }
        await new Promise<void>((resolve) => global.setTimeout(resolve, 1000));
      }
    }

    // Deregister all agents
    const agentIds = Array.from(this.agents.keys());
    agentIds.forEach((id) => this.deregisterAgent(id));

    logger.info('Agent swarm shutdown complete');
  }
}

// Global swarm instance
let globalSwarm: AgentSwarm | null = null;

export function getGlobalSwarm(): AgentSwarm {
  if (!globalSwarm) {
    globalSwarm = new AgentSwarm();
  }
  return globalSwarm;
}

export async function shutdownGlobalSwarm(): Promise<void> {
  if (globalSwarm) {
    await globalSwarm.shutdown();
    globalSwarm = null;
  }
}
