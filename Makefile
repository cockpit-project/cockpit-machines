# extract name from package.json
PACKAGE_NAME := $(shell awk '/"name":/ {gsub(/[",]/, "", $$2); print $$2}' package.json)
RPM_NAME := cockpit-$(PACKAGE_NAME)
VERSION := $(shell T=$$(git describe 2>/dev/null) || T=1; echo $$T | tr '-' '.')
ifeq ($(TEST_OS),)
TEST_OS = fedora-36
endif
export TEST_OS
TARFILE=cockpit-$(PACKAGE_NAME)-$(VERSION).tar.xz
NODE_CACHE=cockpit-$(PACKAGE_NAME)-node-$(VERSION).tar.xz
SPEC=$(RPM_NAME).spec
APPSTREAMFILE=org.cockpit-project.$(PACKAGE_NAME).metainfo.xml
VM_IMAGE=$(CURDIR)/test/images/$(TEST_OS)
# one example file in dist/ from webpack to check if that already ran
WEBPACK_TEST=dist/manifest.json
# one example file in pkg/lib to check if it was already checked out
COCKPIT_REPO_STAMP = pkg/lib/cockpit.js

all: $(WEBPACK_TEST)

#
# i18n
#

LINGUAS=$(basename $(notdir $(wildcard po/*.po)))

po/$(PACKAGE_NAME).js.pot:
	xgettext --default-domain=$(PACKAGE_NAME) --output=$@ --language=C --keyword= \
		--keyword=_:1,1t --keyword=_:1c,2,2t --keyword=C_:1c,2 \
		--keyword=N_ --keyword=NC_:1c,2 \
		--keyword=gettext:1,1t --keyword=gettext:1c,2,2t \
		--keyword=ngettext:1,2,3t --keyword=ngettext:1c,2,3,4t \
		--keyword=gettextCatalog.getString:1,3c --keyword=gettextCatalog.getPlural:2,3,4c \
		--from-code=UTF-8 $$(find src/ -name '*.js' -o -name '*.jsx')

po/$(PACKAGE_NAME).html.pot: package-lock.json $(COCKPIT_REPO_STAMP)
	pkg/lib/html2po -o $@ $$(find src -name '*.html')

po/$(PACKAGE_NAME).manifest.pot: package-lock.json $(COCKPIT_REPO_STAMP)
	pkg/lib/manifest2po src/manifest.json -o $@

po/$(PACKAGE_NAME).metainfo.pot: $(APPSTREAMFILE)
	xgettext --default-domain=$(PACKAGE_NAME) --output=$@ $<

po/$(PACKAGE_NAME).pot: po/$(PACKAGE_NAME).html.pot po/$(PACKAGE_NAME).js.pot po/$(PACKAGE_NAME).manifest.pot po/$(PACKAGE_NAME).metainfo.pot
	msgcat --sort-output --output-file=$@ $^

po/LINGUAS:
	echo $(LINGUAS) | tr ' ' '\n' > $@

#
# Build/Install/dist
#

%.spec: packaging/%.spec.in
	sed -e 's/%{VERSION}/$(VERSION)/g' $< > $@

packaging/arch/PKGBUILD: packaging/arch/PKGBUILD.in
	sed 's/VERSION/$(VERSION)/; s/SOURCE/$(TARFILE)/' $< > $@

packaging/debian/changelog: packaging/debian/changelog.in
	sed 's/VERSION/$(VERSION)/' $< > $@

$(WEBPACK_TEST): $(COCKPIT_REPO_STAMP) $(shell find src/ -type f) package.json webpack.config.js
	test/download-dist $${DOWNLOAD_DIST_OPTIONS:-} || \
	    if [ -z "$$FORCE_DOWNLOAD_DIST" ]; then \
		($(MAKE) package-lock.json && NODE_ENV=$(NODE_ENV) node_modules/.bin/webpack); \
	    else \
		exit 1; \
	    fi

watch:
	NODE_ENV=$(NODE_ENV) node_modules/.bin/webpack --watch

clean:
	rm -rf dist/
	rm -f $(SPEC) packaging/arch/PKGBUILD packaging/debian/changelog
	rm -f po/LINGUAS

install: $(WEBPACK_TEST) po/LINGUAS
	mkdir -p $(DESTDIR)/usr/share/cockpit/$(PACKAGE_NAME)
	cp -r dist/* $(DESTDIR)/usr/share/cockpit/$(PACKAGE_NAME)
	mkdir -p $(DESTDIR)/usr/share/metainfo/
	msgfmt --xml -d po \
		--template $(APPSTREAMFILE) \
		-o $(DESTDIR)/usr/share/metainfo/$(APPSTREAMFILE)

# this requires a built source tree and avoids having to install anything system-wide
devel-install: $(WEBPACK_TEST)
	mkdir -p ~/.local/share/cockpit
	ln -s `pwd`/dist ~/.local/share/cockpit/$(PACKAGE_NAME)

dist: $(TARFILE)
	@ls -1 $(TARFILE)

# when building a distribution tarball, call webpack with a 'production' environment
# we don't ship node_modules for license and compactness reasons; we ship a
# pre-built dist/ (so it's not necessary) and ship package-lock.json (so that
# node_modules/ can be reconstructed if necessary)
$(TARFILE): export NODE_ENV=production
$(TARFILE): $(WEBPACK_TEST) $(SPEC) packaging/arch/PKGBUILD packaging/debian/changelog
	tar --xz -cf $(TARFILE) --transform 's,^,cockpit-$(PACKAGE_NAME)/,' \
		--exclude '*.in' --exclude test/reference \
		$$(git ls-files) pkg/lib/ package-lock.json $(SPEC) packaging/arch/PKGBUILD packaging/debian/changelog dist/

# convenience target for developers
rpm: $(TARFILE) $(SPEC)
	mkdir -p "`pwd`/output"
	mkdir -p "`pwd`/rpmbuild"
	rpmbuild -bb \
	  --define "_sourcedir `pwd`" \
	  --define "_specdir `pwd`" \
	  --define "_builddir `pwd`/rpmbuild" \
	  --define "_srcrpmdir `pwd`" \
	  --define "_rpmdir `pwd`/output" \
	  --define "_buildrootdir `pwd`/build" \
	  $(SPEC)
	find `pwd`/output -name '*.rpm' -printf '%f\n' -exec mv {} . \;
	rm -r "`pwd`/rpmbuild"
	rm -r "`pwd`/output" "`pwd`/build"

# build a VM with locally built distro pkgs installed
$(VM_IMAGE): $(TARFILE) packaging/debian/rules packaging/debian/control packaging/arch/PKGBUILD bots
	bots/image-customize --no-network --fresh --build $(TARFILE) --script $(CURDIR)/test/vm.install $(TEST_OS)

# convenience target for the above
vm: $(VM_IMAGE)
	echo $(VM_IMAGE)

codecheck: test/static-code
	test/static-code

# run the browser integration tests; skip check for SELinux denials
check: package-lock.json $(VM_IMAGE) test/common test/reference
	test/common/run-tests $(RUN_TESTS_OPTIONS)

bots: tools/make-bots
	tools/make-bots

test/reference: test/common
	test/common/pixel-tests pull

# We want tools/node-modules to run every time package-lock.json is requested
# See https://www.gnu.org/software/make/manual/html_node/Force-Targets.html
FORCE:
package-lock.json: FORCE tools/node-modules
	tools/node-modules make_package_lock_json

.PHONY: all clean install devel-install dist rpm check vm

# checkout common files from Cockpit repository required to build this project;
# this has no API stability guarantee, so check out a stable tag when you start
# a new project, use the latest release, and update it from time to time
COCKPIT_REPO_FILES = \
	pkg/lib \
	test/common \
	test/static-code \
	tools/git-utils.sh \
	tools/make-bots \
	tools/node-modules \
	$(NULL)

COCKPIT_REPO_URL = https://github.com/cockpit-project/cockpit.git
COCKPIT_REPO_COMMIT = 80483286d5e7bffd1b7583a499e1b7e04d55f1f3 # 270 + PR#17429

$(COCKPIT_REPO_FILES): $(COCKPIT_REPO_STAMP)
COCKPIT_REPO_TREE = '$(strip $(COCKPIT_REPO_COMMIT))^{tree}'
$(COCKPIT_REPO_STAMP): Makefile
	@git rev-list --quiet --objects $(COCKPIT_REPO_TREE) -- 2>/dev/null || \
	    git fetch --no-tags --no-write-fetch-head --depth=1 $(COCKPIT_REPO_URL) $(COCKPIT_REPO_COMMIT)
	git archive $(COCKPIT_REPO_TREE) -- $(COCKPIT_REPO_FILES) | tar x
