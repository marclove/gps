# Scrollable editor with stationary chrome

## Situation

When I am editing notes

## Motivation

I want to be able to scroll the contents of the notes while always having the editor chrome visible

## Outcome

So I can always see the name of the meeting
So I can still apply formatting to the notes text using the toolbar even when scrolled to the bottom of a lengthy note

## Technical notes

lets move the content part of the notes editor into its own scrollable container so that the title, date, and toolbar are always at the top of the screen. we're going to add other "chrome" to the editor, so now might be a good time (if we haven't already) to leverage a css grid to keep the scrollable area separate from the rest of the chrome.
