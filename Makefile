clean:
	npm cache clean && rm -rf node_modules/*

install:
	npm install

update:
	make clean && rm -rf npm-shrinkwrap.json && npm install && npm shrinkwrap

test:
	./node_modules/.bin/jshint lib/* --config test/jshint/config.json
	@NODE_ENV=test ./node_modules/.bin/mocha --recursive --reporter spec --timeout 3000 test/unit

test-cov:
	@NODE_ENV=test ./node_modules/.bin/mocha --require blanket --recursive --timeout 3000 -R travis-cov test/unit

test-cov-html:
	@NODE_ENV=test ./node_modules/.bin/mocha --require blanket --recursive --timeout 3000 -R html-cov test/unit > test/coverage.html
	xdg-open "file://${CURDIR}/test/coverage.html" &

test-int:
	@NODE_ENV=test ./node_modules/.bin/mocha --recursive --reporter spec --timeout 3000 test/integration

.PHONY: test test-cov test-cov-html test-int
