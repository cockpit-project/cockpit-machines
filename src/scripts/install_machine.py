#! /usr/bin/python3

from contextlib import contextmanager
import configparser
import traceback
import json
import subprocess
import sys
import os
import xml.etree.ElementTree as ET
import tempfile
import logging


def virsh(connection, *args):
    cmd = ("virsh", "-c", f"qemu:///{connection}") + args
    logging.debug("Running virsh command :" + ' '.join(cmd))
    return subprocess.check_output(cmd)


def assert_vm_exists(connection, name):
    # This function should never raise Exception
    try:
        subprocess.check_call(["virsh", "-c", f"qemu:///{connection}", "domuuid", name])
    except subprocess.CalledProcessError:
        logging.error("VM disappeared while being created")
        raise


def get_graphics_capabilies(connection):
    capabilities = virsh(connection, 'domcapabilities')

    root = ET.ElementTree(ET.fromstring(capabilities))
    graphics = root.find('devices').find('graphics')
    supported = graphics.get('supported')

    consoles = []
    if supported == 'yes':
        for value in graphics.find('enum').findall('value'):
            consoles.append(value.text)

    logging.debug('get_graphics_capabilies: ' + ', '.join(consoles))

    return [c for c in consoles if c in ['vnc', 'spice']]


def prepare_graphics_params(connection):
    graphics_config = {
        'spice': {'listen': '127.0.0.1'},
        'vnc': {'listen': '127.0.0.1'}
    }
    try:
        # Configparser needs a default section
        with open("/etc/libvirt/qemu.conf", 'r') as f:
            config_string = '[dummy_section]\n' + f.read()

        config = configparser.ConfigParser()
        config.read_string(config_string)

        graphics_config['spice']['listen'] = config['dummy_section'].get('spice_listen', '127.0.0.1')
        spice_password = config['dummy_section'].get('spice_password', None)
        if spice_password is not None:
            graphics_config['spice']['password'] = spice_password

        graphics_config['vnc']['listen'] = config['dummy_section'].get('vnc_listen', '127.0.0.1')
        vnc_password = config['dummy_section'].get('vnc_password', None)
        if vnc_password is not None:
            graphics_config['vnc']['password'] = vnc_password
    except (EnvironmentError, configparser.Error) as exc:
        logging.debug(exc)
        pass
    params = []

    graphics_cap = get_graphics_capabilies(connection)
    if graphics_cap:
        for graphics in graphics_cap:
            config_options = graphics_config[graphics].keys()
            graphics_options = map(lambda option: f"{option}={graphics_config[graphics][option]}", config_options)
            params += ['--graphics', graphics + "," + ",".join(graphics_options)]
    else:
        params += ['--graphics', 'none']
    return params


@contextmanager
def prepare_unattended(args):
    params = []
    if args['type'] == 'create' and args['unattended']:
        params.append("--unattended")

        unattended_params = [f"profile={args['profile']}"]

        if args['rootPassword']:
            root_pass_file = tempfile.NamedTemporaryFile(
                prefix="cockpit-machines-",
                suffix="-admin-password",
                mode='w+'
            )
            root_pass_file.write(args['rootPassword'])
            root_pass_file.flush()
            unattended_params.append(f"admin-password-file={root_pass_file.name}")

        if args['userLogin']:
            unattended_params.append(f"user-login={args['userLogin']}")

        if args['userPassword']:
            user_pass_file = tempfile.NamedTemporaryFile(
                prefix="cockpit-machines-",
                suffix="-user-password",
                mode='w+'
            )
            user_pass_file.write(args['userPassword'])
            user_pass_file.flush()
            unattended_params.append(f"user-password-file={user_pass_file.name}")

        params.append(",".join(unattended_params))

    yield params


@contextmanager
def prepare_cloud_init(args):
    params = []
    if args['type'] == 'create' and args['sourceType'] == 'cloud':
        params.append("--cloud-init")
        user_data_file = tempfile.NamedTemporaryFile(
            prefix="cockpit-machines-",
            suffix="-user-data",
            mode='w+'
        )
        user_data_file.write("#cloud-config\n")
        if args['userLogin']:
            user_data_file.write("users:\n")
            user_data_file.write(f"  - name: {args['userLogin']}\n")

        if args['rootPassword'] or args['userPassword']:
            # enable SSH password login if any password is set
            user_data_file.write("ssh_pwauth: true\n")
            user_data_file.write("chpasswd:\n")
            user_data_file.write("  list: |\n")
            if args['rootPassword']:
                user_data_file.write(f"    root:{args['rootPassword']}\n")
            if args['userPassword']:
                user_data_file.write(f"    {args['userLogin']}:{args['userPassword']}\n")
            user_data_file.write("  expire: False\n")

        user_data_file.flush()
        params.append(f"user-data={user_data_file.name}")

    yield params


def prepare_installation_source(args):
    params = []
    only_define = args['type'] == 'create' and not args['startVm']
    if only_define:
        params.append("--print-xml=1")

    if args['sourceType'] == "pxe":
        params += ['--pxe', '--network', args['source']]
    elif args['sourceType'] == "os":
        params += ['--install', f"os={args['os']}"]
    elif args['sourceType'] in ['disk_image', 'cloud']:
        params.append("--import")
    elif ((args['source'][0] == '/' and os.path.isfile(args['source'])) or
            (args['sourceType'] == 'url' and args['source'].endswith(".iso"))):
        if not only_define:
            params += ['--cdrom', args['source']]
    else:
        if not only_define:
            params += ['--location', args['source']]

    return params


@contextmanager
def prepare_virt_install_params(args):
    logging.debug(args)
    with prepare_unattended(args) as unattended_params, prepare_cloud_init(args) as cloud_init_params:
        params = [
            "virt-install",
            "--connect", f"qemu:///{args['connectionName']}",
            "--quiet",
            "--name", args['vmName'],
            "--os-variant", args['os'],
            "--memory", str(args['memorySize']),
        ]

        if args['type'] == 'install' or ('storagePool' in args and args['storagePool'] != 'NewVolume'):
            params += ["--check", "path_in_use=off"]

        if args['sourceType'] != 'disk_image':
            params += ["--wait", "-1"]

        if args['type'] == 'install' or args['startVm']:
            params.append("--noautoconsole")

        # Disks
        if args['type'] == 'install':
            disks = args['disks'] or ['none']
            for disk in disks:
                params += ['--disk', disk]
        else:
            params.append("--disk")

            if args['sourceType'] == 'disk_image':
                disk = f"{args['source']},device=disk"
            elif args['storagePool'] == 'NoStorage':
                disk = "none"
            else:
                if args['storagePool'] != 'NewVolume':
                    disk = f"vol={args['storagePool']}/{args['storageVolume']}"
                else:
                    disk = f"size={args['storageSize']},format=qcow2"
                if args['sourceType'] == "cloud":
                    disk += f",backing_store={args['source']}"
            params.append(disk)

        # NICs
        if args['type'] == "install":
            vnics = args['vnics'] or ['none']
            for network in vnics:
                params += ['--network', network]

        # Consoles
        if args['type'] == "install":
            graphics = args['graphics'] or ['none']
            for console in graphics:
                params += ['--graphics', console]
        else:
            params += prepare_graphics_params(args['connectionName'])

        # Installation media
        if args['sourceType'] != "cloud":
            params += prepare_installation_source(args)

        # Autostart
        if args['type'] == 'install' and args['autostart']:
            params.append("--autostart")

        # VCPUs
        if 'vcpu' in args:
            params += ['--vcpus', args['vcpu']]

        # Firmware
        if 'firmware' in args:
            params += ['--boot', args['firmware']]

        params += unattended_params
        params += cloud_init_params

        logging.debug(params)

        yield params


def create_vm(args):
    with prepare_virt_install_params(args) as params:
        xml = subprocess.check_output(params)

    if args['startVm']:
        try:
            assert_vm_exists(args['connectionName'], args['vmName'])

            xml = virsh(args['connectionName'], "dumpxml", "--inactive", args['vmName'])
        except subprocess.CalledProcessError:
            logging.info("The VM got deleted while being installed")
            logging.info(traceback.format_exc())
            sys.exit(0)

    xml_last_phase = xml.strip().split(b'\n\n')[-1]
    # Get last step only - virt-install can output 1 or 2 steps
    inject_metadata(xml_last_phase.decode())


def install_vm(args):
    # If the VM already exists and we want to run the installer we need to remove it first
    try:
        virsh(args['connectionName'], "destroy", args['vmName'])
    except subprocess.CalledProcessError:
        pass

    prevXML = virsh(args['connectionName'], "dumpxml", args['vmName'])

    virsh(args['connectionName'], "undefine", args['vmName'], "--managed-save")

    with prepare_virt_install_params(args) as params:
        try:
            subprocess.check_output(params)
        except subprocess.CalledProcessError as e:
            logging.exception(e)
            # If virt-install returned non-zero return code, redefine
            # the VM so that we get back the metadata which enable the 'Install'
            # button, so that the user can re-attempt installation
            with tempfile.NamedTemporaryFile() as file:
                logging.debug("virt-install failed, redefining to renable the 'Install' button")
                file.write(prevXML)
                file.flush()
                virsh(args['connectionName'], "define", file.name)
            raise e

        assert_vm_exists(args['connectionName'], args['vmName'])

        xml = virsh(args['connectionName'], "dumpxml", "--inactive", args['vmName'])

        inject_metadata(xml.decode())


def inject_metadata(xml):
    # ET.fromstring() already wants UTF-8 encoded bytes
    root = ET.fromstring(xml)
    metadata = root.find('metadata')
    cockpit_machines_metadata = metadata.find('cockpit_machines')
    if cockpit_machines_metadata:
        metadata.remove(cockpit_machines_metadata)

    has_install_phase = "true"
    # VM does not have a pending install phase (visible Install button in the UI) if:
    # - The script is called from the 'Install' button
    # - The script is called from the 'Create' dialog and the VM is started (installer will run)
    # - The script is called from the 'Import' dialog
    if args['type'] == 'install' or args['startVm'] or args['sourceType'] == 'disk_image':
        has_install_phase = "false"

    # Register used namespaces
    ET.register_namespace("cockpit_machines", "https://github.com/cockpit-project/cockpit-machines")
    ET.register_namespace("libosinfo", "http://libosinfo.org/xmlns/libvirt/domain/1.0")

    METADATA = f'''
<cockpit_machines:data xmlns:cockpit_machines="https://github.com/cockpit-project/cockpit-machines"> \
  <cockpit_machines:has_install_phase>{has_install_phase}</cockpit_machines:has_install_phase> \
  <cockpit_machines:install_source_type>{args['sourceType']}</cockpit_machines:install_source_type> \
  <cockpit_machines:install_source>{args['source']}</cockpit_machines:install_source> \
  <cockpit_machines:os_variant>{args['os']}</cockpit_machines:os_variant> \
</cockpit_machines:data>
'''

    cockpit_machines_metadata_new = ET.fromstring(METADATA)
    metadata.append(cockpit_machines_metadata_new)

    updated_xml = ET.tostring(root)

    with tempfile.NamedTemporaryFile() as file:
        file.write(updated_xml)
        file.flush()
        virsh(args['connectionName'], "define", file.name)


logging.basicConfig(level=logging.ERROR, format='%(message)s')
logging.debug(sys.argv[1])

args = json.loads(sys.argv[1], strict=False)

logging.debug(args)

if args['type'] == 'create':
    create_vm(args)
elif args['type'] == 'install':
    install_vm(args)
else:
    raise NotImplementedError("unknown type " + args['type'])
