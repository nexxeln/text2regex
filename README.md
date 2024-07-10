# text2regex

generate regular expressions validated against a thorough test suite

## usage

```sh
text2regex "match three consecutive odd digits"
```

## working

llm generates tests, writes regex, iterates based on test feedback until it passes
