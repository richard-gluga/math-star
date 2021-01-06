# What is Math Star?
            
Math Star is a simple game that allows kids to practise their basic math skills
(plus, minus, multiply) by asking a series of questions, and listening for 
spoken answers via the microphone.

Various options allow customizing the questions to focus on specific skills,
 and ramp up the difficulty as necessary.
            
## About the game
This is a free and open-source
game, developed using standard HTML5 and Javascript, and using the experimental Web
    Speech API, available in Google Chrome and Edge browsers on PC and Android.

You may play this game directly on the web at https://math-star-game.web.app, 
or download and install it as an app on your Android phone.

## Tech Details

The game uses the experimental Web Speech API for speech-to-text and text to speech.
Currently this API is in draft stage and only fully works in Google Chrome, though
may have some partial support in Chromium Edge as well.

The web-based https://math-star-game.web.app is hosted on Firebase as a free project.

This web app is also wrapped into a Trusted Web Activity to create a full-screen
Android app container for it, though under the hood it runs in the regular Android
Chrome browser. Note that Web Speech API does not currently work in a WebView control, 
regardless of what the browser compatibility tables say.

# >Credits & Contact
Sound effects obtained from https://www.zapsplat.com.

For comments or feedback, email richard.gluga@gmail.com

# Deploy Quick Guide

1. To deploy to live Firebase instance, run from local directory:

`firebase deploy --only hosting`

2. Live URL is https://math-star-game.web.app

3. Details for Firebase hosting:  https://firebase.google.com/docs/hosting/quickstart

4. Details for creating a TWA app: https://developers.google.com/web/android/trusted-web-activity/integration-guide