# coreos-installer-static

Static builds of [CoreOS Installer][coreos-installer] for quick Fedora CoreOS (and similar) bootstrapping.

## Usage

```bash
bash <(curl -s -L https://github.com/ZentriaMC/coreos-installer-static/releases/latest/download/installer.sh) install
```

```bash
version="0.21.0"
bash <(curl -s -L https://github.com/ZentriaMC/coreos-installer-static/releases/download/${version}/installer.sh) install
```

### Terraform

```terraform
locals {
  coreos_installer_version = "0.21.0"
  coreos_installer_url     = "https://github.com/ZentriaMC/coreos-installer-static/releases/download/${coreos_installer_version}/installer.sh"
}

resource "hcloud_server" "node" {
  # ...

  connection {
    type        = "ssh"
    host        = self.ipv4_address
    timeout     = "5m"
    user        = "root"
    private_key = var.provision_ssh_private_key
  }

  provisioner "file" {
    content     = file("${path.module}/ignition/node.ign")
    destination = "/root/node.ign"
  }

  provisioner "remote-exec" {
    inline = [
      "curl -L -s ${local.coreos_installer_url} | bash -s - install --platform=hetzner --ignition-file=/root/node.ign /dev/sda",
      "systemd-run --no-block --unit=postinstall-reboot.service /bin/sh -c 'sleep 2 && reboot'",
    ]
  }
}
```


[coreos-installer]: https://coreos.github.io/coreos-installer/
