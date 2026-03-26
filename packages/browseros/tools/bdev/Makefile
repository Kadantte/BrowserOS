BINARY := bdev
GOBIN := $(shell go env GOPATH)/bin

.PHONY: build install test clean

build:
	go build -o $(BINARY) .

install: build
	cp $(BINARY) $(GOBIN)/$(BINARY)
	codesign --force --sign - $(GOBIN)/$(BINARY)
	@echo "Installed $(BINARY) to $(GOBIN)/$(BINARY)"

test:
	go test ./...

clean:
	rm -f $(BINARY)
