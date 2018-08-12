// dep modules
import { EventEmitter } from 'eventemitter3';

// own modules
import {
    ITaskTimerOptions, ITaskOptions, Task as TTask, TaskCallback, ITaskTimerEvent, ITimeInfo
} from '.';

/**
 *  @private
 */
const DEFAULT_TIMER_OPTIONS: ITaskTimerOptions = Object.freeze({
    interval: 1000,
    stopOnCompleted: false
});

/**
 *  TaskTimer • https://github.com/onury/tasktimer
 *  @license MIT
 *  @copyright 2018, Onur Yıldırım <onur@cutepilot.com>
 */

/**
 *  A timer utility for running periodic tasks on the given interval ticks.
 *  This is useful when you want to run or schedule multiple tasks on a single
 *  timer instance.
 *
 *  This class extends `EventEmitter3` which is an `EventEmitter` implementation
 *  for both Node and browser. Only a small set of its methods are documented in
 *  this documentation. For a complete list, refer to Node.js documentation.
 *
 *  @see {@link https://nodejs.org/api/events.html#events_class_eventemitter|EventEmitter}
 */
class TaskTimer extends EventEmitter {

    /**
     *  @private
     */
    private _: {
        options: ITaskTimerOptions;
        state: TaskTimer.State;
        tasks: { [k: string]: TTask };
        tickCount: number;
        runCount: number;
        startTime: number;
        stopTime: number;
        completedCount: number;
    };

    /**
     *  @private
     */
    private _timer: any;

    // ---------------------------
    // CONSTRUCTOR
    // ---------------------------

    /**
     *  Constructs a new `TaskTimer` instance with the given time interval (in
     *  milliseconds).
     *  @constructor
     *
     *  @param {ITaskTimerOptions|number} [options] - Either TaskTimer options
     *  or a base interval (in milliseconds). Since the tasks run on ticks
     *  instead of millisecond intervals; this value operates as the base
     *  resolution for all tasks. If you are running heavy tasks, lower interval
     *  requires higher CPU power. This value can be updated any time by setting
     *  the `interval` property on the instance.
     *  @returns {TaskTimer}
     *
     *  @example
     *  const timer = new TaskTimer(1000); // milliseconds
     *  // Execute some code on each tick...
     *  timer.on('tick', () => {
     *      console.log('tick count: ' + timer.tickCount);
     *      console.log('elapsed time: ' + timer.time.elapsed + ' ms.');
     *  });
     *  // Or add a task named 'heartbeat' that runs every 5 ticks and a total of 10 times.
     *  const task = {
     *      name: 'heartbeat',
     *      tickInterval: 5, // ticks
     *      totalRuns: 10,   // times
     *      callback: function (task) {
     *          console.log(task.name + ' task has run ' + task.currentRuns + ' times.');
     *      }
     *  };
     *  timer.addTask(task).start();
     */
    constructor(options?: ITaskTimerOptions | number) {
        super();

        options = typeof options !== 'number'
            ? Object.assign({}, DEFAULT_TIMER_OPTIONS, options || {})
            : Object.assign({}, DEFAULT_TIMER_OPTIONS, { interval: options });

        this._timer = null;
        this._reset();
        this._.options = options;
    }

    // ---------------------------
    // PUBLIC (INSTANCE) PROPERTIES
    // ---------------------------

    /**
     *  Gets or sets the timer interval in milliseconds.
     *
     *  Since the tasks run on ticks instead of millisecond intervals; this
     *  value operates as the base resolution for all tasks. If you are running
     *  heavy tasks; lower interval requires higher CPU power.
     *  @memberof TaskTimer
     *  @type {Number}
     */
    get interval(): number {
        return this._.options.interval;
    }
    set interval(value: number) {
        this._.options.interval = value || DEFAULT_TIMER_OPTIONS.interval;
    }

    /**
     *  Gets or sets whether the timer should automatically stop when all tasks
     *  are completed. For this to take affect, all added tasks should have
     *  `totalRuns` and/or `stopDate` configured. This option can be set/changed
     *  at any time.
     *  @memberof TaskTimer
     *  @type {boolean}
     */
    get stopOnCompleted(): boolean {
        return this._.options.stopOnCompleted;
    }
    set stopOnCompleted(value: boolean) {
        this._.options.stopOnCompleted = Boolean(value);
    }

    /**
     *  Gets the current state of the timer.
     *  For possible values, see `TaskTimer.State` enumeration.
     *  @memberof TaskTimer
     *  @type {TaskTimer.State}
     *  @readonly
     */
    get state(): TaskTimer.State {
        return this._.state;
    }

    /**
     *  Gets time information for the latest run of the timer.
     *  `#time.started` indicates the start time of the timer.
     *  `#time.stopped` indicates the stop time of the timer. (`0` if still running.)
     *  `#time.elapsed` indicates the elapsed time of the timer.
     *  @memberof TaskTimer
     *  @type {ITimeInfo}
     *  @readonly
     */
    get time(): ITimeInfo {
        const current = this.state !== TaskTimer.State.STOPPED ? Date.now() : this._.stopTime;
        return Object.freeze({
            started: this._.startTime,
            stopped: this._.stopTime,
            elapsed: current - this._.startTime
        });
    }

    /**
     *  Gets the current tick count for the latest run of the timer.
     *  This value will be reset to `0` when the timer is stopped or reset.
     *  @memberof TaskTimer
     *  @type {Number}
     *  @readonly
     */
    get tickCount(): number {
        return this._.tickCount;
    }

    /**
     *  Gets the current task count. Tasks remain even after the timer is
     *  stopped. But they will be removed if the timer is reset.
     *  @memberof TaskTimer
     *  @type {Number}
     *  @readonly
     */
    get taskCount(): number {
        return Object.keys(this._.tasks).length;
    }

    /**
     *  Gets the total number of all task executions (runs).
     *  @memberof TaskTimer
     *  @type {Number}
     *  @readonly
     */
    get runCount(): number {
        return this._.runCount;
    }

    // ---------------------------
    // PUBLIC (INSTANCE) METHODS
    // ---------------------------

    /**
     *  Gets the task with the given name.
     *  @memberof TaskTimer
     *
     *  @param {String} name - Name of the task.
     *
     *  @returns {Task}
     */
    get(name: string): TTask {
        return this._.tasks[name] || null;
    }

    /**
     *  Adds a collection of new tasks for the timer.
     *  @memberof TaskTimer
     *  @chainable
     *
     *  @param {Task|ITaskOptions|TaskCallback|Array<any>} task - Either a
     *  single task, task options object or the callback function; or a mixture
     *  of these as an array.
     *
     *  @returns {TaskTimer}
     *
     *  @throws {Error} - If a task callback is not set or a task with the given
     *  name already exists.
     */
    add(task: TTask | ITaskOptions | TaskCallback | Array<TTask | ITaskOptions | TaskCallback>): TaskTimer {
        const list = _ensureArray(task);
        (list || []).forEach((item: any) => this._add(item));
        return this;
    }

    /**
     *  Removes the task by the given name.
     *  @memberof TaskTimer
     *  @chainable
     *
     *  @param {string|Task} task - Task to be removed. Either pass the
     *  name or the task itself.
     *
     *  @returns {TaskTimer}
     *
     *  @throws {Error} - If a task with the given name does not exist.
     */
    remove(task: string | TTask): TaskTimer {
        const name: string = typeof task === 'string' ? task : task.name;
        task = this.get(name);

        if (!name || !task) {
            throw new Error(`No tasks exist with name '${name}'.`);
        }

        // first decrement completed tasks count if this is a completed task.
        if (task.completed && this._.completedCount > 0) this._.completedCount--;

        this._.tasks[name] = null;
        delete this._.tasks[name];
        this._emit(TaskTimer.EventType.TASK_REMOVED, task);
        return this;
    }

    /**
     *  Starts the timer and puts the timer in `RUNNING` state. If it's already
     *  running, this will reset the start/stop time and tick count, but will not
     *  reset (or remove) existing tasks.
     *  @memberof TaskTimer
     *  @chainable
     *
     *  @returns {TaskTimer}
     */
    start(): TaskTimer {
        this._stop();
        this._.startTime = Date.now();
        this._.stopTime = 0;
        this._.tickCount = 0;
        this._.runCount = 0;
        this._run();
        this._.state = TaskTimer.State.RUNNING;
        this._emit(TaskTimer.EventType.STARTED);
        return this;
    }

    /**
     *  Pauses the timer, puts the timer in `PAUSED` state and all tasks on hold.
     *  @memberof TaskTimer
     *  @chainable
     *
     *  @returns {TaskTimer}
     */
    pause(): TaskTimer {
        if (this.state !== TaskTimer.State.RUNNING) return this;
        this._stop();
        this._.state = TaskTimer.State.PAUSED;
        this._emit(TaskTimer.EventType.PAUSED);
        return this;
    }

    /**
     *  Resumes the timer and puts the timer in `RUNNING` state; if previuosly
     *  paused. In this state, all existing tasks are resumed.
     *  @memberof TaskTimer
     *  @chainable
     *
     *  @returns {TaskTimer}
     */
    resume(): TaskTimer {
        if (this.state !== TaskTimer.State.PAUSED) return this;
        this._run();
        this._.state = TaskTimer.State.RUNNING;
        this._emit(TaskTimer.EventType.RESUMED);
        return this;
    }

    /**
     *  Stops the timer and puts the timer in `STOPPED` state. In this state, all
     *  existing tasks are stopped and no values or tasks are reset until
     *  re-started or explicitly calling reset.
     *  @memberof TaskTimer
     *  @chainable
     *
     *  @returns {TaskTimer}
     */
    stop(): TaskTimer {
        if (this.state !== TaskTimer.State.RUNNING) return this;
        this._stop();
        this._.stopTime = Date.now();
        this._.state = TaskTimer.State.STOPPED;
        this._emit(TaskTimer.EventType.STOPPED);
        return this;
    }

    /**
     *  Stops the timer and puts the timer in `IDLE` state.
     *  This will reset the ticks and removes all tasks silently; meaning no
     *  other events will be emitted such as `"taskRemoved"`.
     *  @memberof TaskTimer
     *  @chainable
     *
     *  @returns {TaskTimer}
     */
    reset(): TaskTimer {
        this._reset();
        this._emit(TaskTimer.EventType.RESET);
        return this;
    }

    // ---------------------------
    // PRIVATE (INSTANCE) METHODS
    // ---------------------------

    /**
     *  @private
     */
    private _emit(type: TaskTimer.EventType, data?: any): boolean {
        const event: ITaskTimerEvent = {
            type,
            source: this,
            data
        };
        return this.emit(type, event);
    }

    /**
     *  Adds a new task for the timer.
     *  @private
     *
     *  @param {Task|ITaskOptions|TaskCallback} options - Either a task instance,
     *  task options object or the callback function to be executed on tick
     *  intervals.
     *
     *  @returns {TaskTimer}
     *
     *  @throws {Error} - If the task callback is not set or a task with the
     *  given name already exists.
     */
    private _add(options: TTask | ITaskOptions | TaskCallback): TaskTimer {
        if (typeof options === 'function') {
            options = {
                callback: options
            };
        }

        if (_type(options) === 'object' && !options.name) {
            (options as ITaskOptions).name = this._getNewTaskName();
        }

        if (this.get(options.name)) {
            throw new Error(`A task with name '${options.name}' already exists.`);
        }

        const task = options instanceof TTask ? options : new TTask(options);
        this._.tasks[task.name] = task;
        this._emit(TaskTimer.EventType.TASK_ADDED, task);
        return this;
    }

    /**
     *  Stops the timer.
     *  @private
     */
    private _stop(): void {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    /**
     *  Resets the timer.
     *  @private
     */
    private _reset(): void {
        this._stop();
        this._ = {
            options: (this._ || {} as any).options,
            state: TaskTimer.State.IDLE,
            tasks: {},
            tickCount: 0,
            runCount: 0,
            startTime: 0,
            stopTime: 0,
            completedCount: 0
        };
    }

    /**
     *  Handler to be executed on each tick.
     *  @private
     */
    private _tick(): void {
        let name: string;
        let task: TTask;
        let tasks = this._.tasks;

        for (name in tasks) {
            task = tasks[name];
            if (!task) continue;

            if (this.tickCount % task.tickInterval === 0) {
                // below will not execute if task is disabled or already
                // completed.
                (task as any)._run(() => {
                    this._.runCount += 1;
                    this._emit(TaskTimer.EventType.TASK, task);
                    if (task.completed) {
                        this._.completedCount++;
                        this._emit(TaskTimer.EventType.TASK_COMPLETED, task);
                    }
                    if (this._.completedCount === this.taskCount) {
                        this._emit(TaskTimer.EventType.COMPLETED);
                        if (this.stopOnCompleted) this.stop();
                    }
                });
            }
        }

        this._.tickCount += 1;
        this._emit(TaskTimer.EventType.TICK);
    }

    /**
     *  Runs the timer.
     *  @private
     */
    private _run(): void {
        this._timer = setInterval(() => {
            this._tick();
            this._.state = TaskTimer.State.RUNNING;
        }, this._.options.interval);
    }

    /**
     *  Gets a unique task name.
     *  @private
     */
    private _getNewTaskName(): string {
        let num: number = this.taskCount;
        let name: string;
        while (!name || this.get(name)) {
            num++;
            name = 'task-' + num;
        }
        return name;
    }
}

// ---------------------------
// EXPORT
// ---------------------------

// tslint:disable no-namespace
namespace TaskTimer {

    /**
     *  Represents the class that holds the configurations and the callback function
     *  required to run a task.
     *  @class
     */
    export const Task = TTask;

    /**
     *  Enumerates `TaskTimer` states.
     *  @enum {String}
     *  @readonly
     */
    export enum State {
        /**
         *  Indicates that the timer is in `idle` state.
         *  This is the initial state when the `TaskTimer` instance is first created.
         *  Also when an existing timer is reset, it will be `idle`.
         *  @memberof TaskTimer.State
         *  @type {Number}
         */
        IDLE = 'idle',
        /**
         *  Indicates that the timer is in `running` state; such as when the timer is
         *  started or resumed.
         *  @memberof TaskTimer.State
         *  @type {Number}
         */
        RUNNING = 'running',
        /**
         *  Indicates that the timer is in `paused` state.
         *  @memberof TaskTimer.State
         *  @type {Number}
         */
        PAUSED = 'paused',
        /**
         *  Indicates that the timer is in `stopped` state.
         *  @memberof TaskTimer.State
         *  @type {Number}
         */
        STOPPED = 'stopped'
    }

    /**
     *  Enumerates the `TaskTimer` event types.
     *  @enum {String}
     *  @readonly
     */
    export enum EventType {
        /**
         *  Emitted on each tick (interval) of `TaskTimer`.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        TICK = 'tick',
        /**
         *  Emitted when the timer is put in `RUNNING` state; such as when the timer is
         *  started.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        STARTED = 'started',
        /**
         *  Emitted when the timer is put in `RUNNING` state; such as when the timer is
         *  resumed.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        RESUMED = 'resumed',
        /**
         *  Emitted when the timer is put in `PAUSED` state.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        PAUSED = 'paused',
        /**
         *  Emitted when the timer is put in `STOPPED` state.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        STOPPED = 'stopped',
        /**
         *  Emitted when the timer is reset.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        RESET = 'reset',
        /**
         *  Emitted when a task is executed.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        TASK = 'task',
        /**
         *  Emitted when a task is added to `TaskTimer` instance.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        TASK_ADDED = 'taskAdded',
        /**
         *  Emitted when a task is removed from `TaskTimer` instance.
         *  Note that this will not be emitted when `.reset()` is called; which
         *  removes all tasks silently.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        TASK_REMOVED = 'taskRemoved',
        /**
         *  Emitted when a task has completed all of its executions (runs)
         *  or reached its stopping date/time (if set). Note that this event
         *  will only be fired if the tasks has a `totalRuns` limit or a
         *  `stopDate` value set.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        TASK_COMPLETED = 'taskCompleted',
        /**
         *  Emitted when all tasks have completed all of their executions (runs)
         *  or reached their stopping date/time (if set). Note that this event
         *  will only be fired if all tasks have a `totalRuns` limit or a
         *  `stopDate` value set.
         *  @memberof TaskTimer.Event
         *  @type {String}
         */
        COMPLETED = 'completed'
    }
}

export { TaskTimer };

// ---------------------------
// ADDITIONAL DOCUMENTATION
// ---------------------------

/**
 *  @private
 */
function _ensureArray(o: any): any[] {
    return o
        ? !Array.isArray(o) ? [o] : o
        : [];
}

/**
 *  @private
 */
function _type(o: any): string {
    return Object.prototype.toString.call(o).match(/\s(\w+)/i)[1].toLowerCase();
}

// ---------------------------
// ADDITIONAL DOCUMENTATION
// ---------------------------

/**
 *  Adds the listener function to the end of the listeners array for the event
 *  named `eventName`. No checks are made to see if the listener has already
 *  been added. Multiple calls passing the same combination of eventName and
 *  listener will result in the listener being added, and called, multiple times.
 *  @name TaskTimer#on
 *  @function
 *  @alias TaskTimer#addListener
 *  @chainable
 *
 *  @param {String} eventName - The name of the event to be added.
 *  @param {Function} listener - The callback function to be invoked per event.
 *
 *  @returns {Object} - `{@link #TaskTimer|TaskTimer}` instance.
 */

/**
 *  Adds a one time listener function for the event named `eventName`. The next
 *  time eventName is triggered, this listener is removed and then invoked.
 *  @name TaskTimer#once
 *  @function
 *  @chainable
 *
 *  @param {String} eventName - The name of the event to be added.
 *  @param {Function} listener - The callback function to be invoked per event.
 *
 *  @returns {Object} - `{@link #TaskTimer|TaskTimer}` instance.
 */

 /**
  *  Removes the specified `listener` from the listener array for the event
  *  named `eventName`.
  *  @name TaskTimer#off
  *  @function
  *  @alias TaskTimer#removeListener
  *  @chainable
  *
  *  @param {String} eventName - The name of the event to be removed.
  *  @param {Function} listener - The callback function to be invoked per event.
  *
  *  @returns {Object} - `{@link #TaskTimer|TaskTimer}` instance.
  */

 /**
  *  Removes all listeners, or those of the specified eventName.
  *  @name TaskTimer#removeAllListeners
  *  @function
  *  @chainable
  *
  *  @param {String} eventName - The name of the event to be removed.
  *  @param {Function} listener - The callback function to be invoked per event.
  *
  *  @returns {Object} - `{@link #TaskTimer|TaskTimer}` instance.
  */