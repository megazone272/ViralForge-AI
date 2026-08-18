/**
 * In-Memory Job Queue
 * Interface-compatible with BullMQ for easy future swap.
 * State machine: QUEUED → PROCESSING → READY / FAILED
 */
import { EventEmitter } from "node:events";

export type JobState = "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "SCHEDULED";

export interface Job<T = unknown> {
  id: string;
  type: string;
  data: T;
  state: JobState;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: unknown;
  scheduledFor?: Date;
}

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<unknown>;

class InMemoryQueue extends EventEmitter {
  private jobs = new Map<string, Job>();
  private handlers = new Map<string, JobHandler>();
  private running = new Set<string>();
  private maxConcurrent = 2;

  register<T>(type: string, handler: JobHandler<T>): void {
    this.handlers.set(type, handler as JobHandler);
  }

  async enqueue<T>(type: string, data: T, opts: { maxAttempts?: number; scheduledFor?: Date } = {}): Promise<Job<T>> {
    const { randomUUID } = await import("node:crypto");
    const job: Job<T> = {
      id: randomUUID(),
      type,
      data,
      state: opts.scheduledFor ? "SCHEDULED" : "QUEUED",
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? 3,
      scheduledFor: opts.scheduledFor,
    };
    this.jobs.set(job.id, job as Job);
    this.emit("enqueue", job);
    if (!opts.scheduledFor) setImmediate(() => this.process());
    return job;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  listJobs(filter?: { type?: string; state?: JobState }): Job[] {
    const all = Array.from(this.jobs.values());
    if (!filter) return all;
    return all.filter((j) => {
      if (filter.type && j.type !== filter.type) return false;
      if (filter.state && j.state !== filter.state) return false;
      return true;
    });
  }

  private async process(): Promise<void> {
    if (this.running.size >= this.maxConcurrent) return;

    const now = new Date();
    const pending = Array.from(this.jobs.values()).filter(
      (j) =>
        j.state === "QUEUED" ||
        (j.state === "SCHEDULED" && j.scheduledFor && j.scheduledFor <= now)
    );
    if (!pending.length) return;

    const job = pending[0];
    const handler = this.handlers.get(job.type);
    if (!handler) {
      job.state = "FAILED";
      job.error = `No handler registered for job type: ${job.type}`;
      return;
    }

    job.state = "PROCESSING";
    job.startedAt = new Date();
    job.attempts++;
    this.running.add(job.id);
    this.emit("processing", job);

    try {
      job.result = await handler(job);
      job.state = "READY";
      job.completedAt = new Date();
      this.emit("completed", job);
    } catch (e: any) {
      job.error = e.message;
      if (job.attempts < job.maxAttempts) {
        job.state = "QUEUED"; // retry
        console.warn(`[queue] Job ${job.id} (${job.type}) failed, retrying (${job.attempts}/${job.maxAttempts}): ${e.message}`);
        setTimeout(() => this.process(), 5000 * job.attempts); // backoff
      } else {
        job.state = "FAILED";
        job.completedAt = new Date();
        console.error(`[queue] Job ${job.id} (${job.type}) permanently failed after ${job.attempts} attempts: ${e.message}`);
        this.emit("failed", job);
      }
    } finally {
      this.running.delete(job.id);
      // Check for more pending
      setImmediate(() => this.process());
    }
  }

  /** Periodic tick for scheduled jobs */
  startScheduler(intervalMs = 10_000): NodeJS.Timeout {
    return setInterval(() => this.process(), intervalMs);
  }
}

export const queue = new InMemoryQueue();
