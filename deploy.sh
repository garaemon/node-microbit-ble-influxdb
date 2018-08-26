#!/bin/bash

rsync -avz ./*.json $1/
rsync -avz ./build/ $1/build/
