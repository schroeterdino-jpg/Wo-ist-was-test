import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {JarvisTrailer} from './trailer';

const Root=()=> <Composition id="JarvisTrailer" component={JarvisTrailer} durationInFrames={2400} fps={30} width={1080} height={1920}/>;
registerRoot(Root);
