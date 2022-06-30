# Audio Mixer

-   [Demo](#demo)
-   [Install](#install-via-npm)
-   [Support us](#support-us)

## Demo

To view a demo online:
https://audiomixer.io

To view demo examples locally clone the repo and run `npm install && npm run serve`

## Use directly from a CDN

```html
<!DOCTYPE html>
<html>
    <head>
        <link
            rel="stylesheet"
            type="text/css"
            href="https://unpkg.com/vue-audio-mixer/dist/vue-audio-mixer.min.css"
        />
    </head>
    <body>
        <div id="app">
            <div>
                <div style="text-align: center;">
                    <div style="position:relative; display: inline-block; ">
                        <vue-audio-mixer
                            :config="config"
                            size="medium"
                            theme="dark"
                            :show-pan="true"
                            :show-total-time="true"
                        />
                    </div>
                </div>
            </div>
        </div>
        <script src="https://unpkg.com/vue@2.6.14/dist/vue.js"></script>
        <script src="https://unpkg.com/vue-audio-mixer/dist/vue-audio-mixer.min.js"></script>

        <script>
            const app = new Vue({
                el: '#app',
                data: function() {
                    return {
                        is_loaded: false,
                        newconfig: {},
                        config: {
                            tracks: [
                                {
                                    title: 'Bass',
                                    url: 'https://audiomixer.io/stems/bass.mp3',
                                    pan: -30,
                                    gain: 1.2,
                                    muted: false,
                                    hidden: false,
                                },
                                {
                                    title: 'Flutes',
                                    url:
                                        'https://audiomixer.io/stems/flutes.mp3',
                                    pan: 73,
                                    gain: 0.9,
                                    muted: false,
                                    hidden: false,
                                },
                                {
                                    title: 'Perc',
                                    url: 'https://audiomixer.io/stems/perc.mp3',
                                    pan: 26,
                                    gain: 0.85,
                                    muted: false,
                                    hidden: false,
                                },
                                {
                                    title: 'Piano',
                                    url:
                                        'https://audiomixer.io/stems/piano.mp3',
                                    pan: 10,
                                    gain: 1.2,
                                    muted: false,
                                    hidden: false,
                                },
                                {
                                    title: 'Strings',
                                    url:
                                        'https://audiomixer.io/stems/strings.mp3',
                                    pan: -49,
                                    gain: 0.9,
                                    muted: false,
                                    hidden: false,
                                },
                            ],
                            master: {
                                pan: 0,
                                gain: 0.3,
                                muted: false,
                            },
                        },
                    };
                },
            });
        </script>
    </body>
</html>
```

## Install via NPM

```bash
npm install vue-audio-mixer --save
```

```html
<template>
    <div>
        <div style="text-align: center;">
            <div style="position:relative; display: inline-block; ">
                <vue-audio-mixer
                    :config="config"
                    size="medium"
                    theme="dark"
                    :showPan="true"
                    :showTotalTime="true"
                />
            </div>
        </div>
    </div>
</template>

<script>
    import VueAudioMixer from 'vue-audio-mixer';
    import 'vue-audio-mixer/dist/vue-audio-mixer.min.css';

    export default {
        name: 'App',
        components: {
            VueAudioMixer,
        },
        data: function() {
            return {
                is_loaded: false,
                newconfig: {},
                config: {
                    tracks: [
                        {
                            title: 'Bass',
                            url: 'https://audiomixer.io/stems/bass.mp3',
                            pan: -30,
                            gain: 1.2,
                            muted: false,
                            hidden: false,
                        },
                        {
                            title: 'Flutes',
                            url: 'https://audiomixer.io/stems/flutes.mp3',
                            pan: 73,
                            gain: 0.9,
                            muted: false,
                            hidden: false,
                        },
                        {
                            title: 'Perc',
                            url: 'https://audiomixer.io/stems/perc.mp3',
                            pan: 26,
                            gain: 0.85,
                            muted: false,
                            hidden: false,
                        },
                        {
                            title: 'Piano',
                            url: 'https://audiomixer.io/stems/piano.mp3',
                            pan: 10,
                            gain: 1.2,
                            muted: false,
                            hidden: false,
                        },
                        {
                            title: 'Strings',
                            url: 'https://audiomixer.io/stems/strings.mp3',
                            pan: -49,
                            gain: 0.9,
                            muted: false,
                            hidden: false,
                        },
                    ],
                    master: {
                        pan: 0,
                        gain: 0.3,
                        muted: false,
                    },
                },
            };
        },
    };
</script>
```

## Available props

| Prop          | Type    | Default | Description                        |
| ------------- | ------- | ------- | ---------------------------------- |
| config        | Object  |         | Mixer config                       |
| size          | String  | medium  | Size of mixer (small/medium)       |
| theme         | String  | default | colour theme (default/dark)        |
| showPan       | Boolean | true    | Show panners                       |
| showTotalTime | Boolean | true    | Show the total time in the display |

## Events

| Event   | Type    | Description                     |
| ------- | ------- | ------------------------------- |
| @loaded | Boolean | Fires when the mixer is loaded  |
| @input  | Object  | Fires when the mixer is changed |

## Support us

Vue Audio Mixer is developed and maintained by Realstrings in support of Samaritans. If Vue-Audio-Mixer makes it to your production environment, we would appreciate you making a donation at the following link. https://www.justgiving.com/fundraising/onlineaudiomixer
