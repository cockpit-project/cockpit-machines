/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2025 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

/* This is an experiment re React state management patterns.

   Hooks are cool and all, but they don't allow dynamic patterns.
   Each function component needs to have a static list of hook
   invocations at the top.  Also, if you want to get everything done
   with hooks, you will end up with too many useEffects that trigger
   each other in complicated ways.

   Thus, if things get only slightly complicated I'll immediately make
   a proper class that emits signals. Inside that class, we can just
   write normal code!  How refreshing!  Such a class needs to be
   "hooked up" via useObject and useEvent.

   But it's a bit too much boilerplate, so let's make a common
   foundation for this pattern.

   Use it like this:

      class MyState extends StateObject {
          constructor() {
              super();
              this.whatever = 12;
          }

          setWhatever(val) {
              this.whatever = val;
              this.update();
          }
      }

      const MyComp = () => {
          const state = useStateObject(() => new MyState());

          return <span>{state.whatever}</span>;
      }

   This call to "this.update" in "setWhatever" will cause a re-render
   of MyComp.

   There are some more features:

   - When a state object should be disposed of, its "close" method is
     called.  This method should close all channels etc.

   - If you want to combine state objects into a larger one, the
     larger one can call "follow" on its sub-objects.  This will
     invoke a given callback and the larger object can update itself
     based on the sub-object. (This is really just a thin wrapper
     around "EventEmitter.on").

  This is all really not a lot of code, but when using these helpers,
  it keeps the focus on the actual state and away from the mechanics
  of how to trigger a render.
*/

import { EventEmitter } from 'cockpit/event';
import { useObject, useOn } from 'hooks';

interface StateEvents {
    render: () => void;
}

export class StateObject extends EventEmitter<StateEvents> {
    update() {
        this.emit("render");
    }

    follow(obj: StateObject, callback: () => void) {
        return obj.on("render", callback || (() => this.update()));
    }

    close() {
    }
}

type Tuple = readonly [...unknown[]];
type Comparator<T> = (a: T, b: T) => boolean;
type Comparators<T extends Tuple> = {[ t in keyof T ]?: Comparator<T[t]>};

export function useStateObject<D extends Tuple>(constructor: () => StateObject, deps: D, comps?: Comparators<D>) {
    const state = useObject<StateObject, D>(constructor, obj => obj.close(), deps, comps);
    useOn(state, "render");
    return state;
}
