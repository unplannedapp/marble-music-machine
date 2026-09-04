// Importing each module registers its object type with the factory registry.
import './Rail';
import './Ramp';
import './Bumper';
import './Pad';
import './Pipe';
export { InteractiveObject, createObject, registerObjectType } from './InteractiveObject';
export { Rail } from './Rail';
export { Ramp } from './Ramp';
export { Bumper } from './Bumper';
export { Pad } from './Pad';
export { Pipe } from './Pipe';
