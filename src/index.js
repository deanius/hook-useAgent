import React, { useReducer, useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { interval, fromEvent, Subject } from "rxjs";
import { map, takeUntil } from "rxjs/operators";

// Reuse an instance, or import this shared one
import { Agent } from "rx-helper";

const PERIOD = 1000;

function Counter() {
  let initialState = { count: 1, step: 1 };
  const [state, dispatch] = useReducer(reducer, initialState);
  const { step, count } = state;
  const [agent, _] = useState(() => new Agent());
  const { process, subscribe } = useAgent(
    ({ on, filter, actionsOfType, agentEvents }) => {
      console.log("useAgent hook start");
      // The reducer is another destination, for step/tick
      filter(/step|tick/, ({ action }) => dispatch(action));
      // Prior to 'on' handlers running, this fitler will log every action
      filter(/.*/, ({ action }) => console.log(action));

      // Here's what you can do with agent-powered handlers
      //prettier-ignore
      on("step", ({ action }) => {
      return interval(1000).pipe(
        map(() => action.step),
        takeUntil(actionsOfType("stop"))
      );
    }, {
      concurrency: "cutoff",
      type: "tick"
    });

      // aftter configuring the handlers, you can process individual,
      // or subscribe to streams of actions below. This is only run once.
      process({ type: "step", step: 1 });
    },
    agent
  );

  return (
    <>
      <h1>{count}</h1>
      <input
        type="number"
        value={step}
        onChange={e => {
          process({
            type: "step",
            step: Number(e.target.value)
          });
        }}
      />
      <button id="stop-btn" onClick={() => process({ type: "stop" })}>
        Stop
      </button>
      <button onClick={tearItDown}>Unmount</button>
    </>
  );
}

const initialState = {
  count: 0,
  step: 1
};

function reducer(state, action) {
  const { count, step } = state;
  // console.log(action.type)
  if (action.type === "tick") {
    return { count: count + step, step };
  } else if (action.type === "step") {
    return { count, step: action.step };
  } else {
    throw new Error();
  }
}

const rootElement = document.getElementById("root");
ReactDOM.render(<Counter />, rootElement);

function tearItDown() {
  ReactDOM.unmountComponentAtNode(rootElement);
}

// Must be called within a hook!
function useAgent(setupAgent, agent) {
  const handles = [];
  const events = new Subject();
  const agentApi = {
    on(...args) {
      events.next({ type: "agent/on", pattern: args[0] });
      handles.push({ handler: agent.on(...args), args, type: "on" });
    },
    filter(...args) {
      events.next({ type: "agent/filter", pattern: args[0] });
      handles.push({ handler: agent.filter(...args), args, type: "filter" });
    },
    actionsOfType: agent.actionsOfType.bind(agent),
    agentEvents: events.asObservable()
  };
  useEffect(() => {
    setupAgent(agentApi);
    return () => {
      handles.forEach(({ handler, args, type }) => {
        events.next({ type: `agent/${type}/unsub`, pattern: args[0] });
        handler.unsubscribe();
      });
    };
  }, []);

  return {
    // Process is much like `dispatch`, but with a different return type
    process: agent.process.bind(agent),
    // Subscribe is line `process` in a loop over an Observable
    subscribe: agent.subscribe.bind(agent)
  };
}
