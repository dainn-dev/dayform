import { describe, expect, test } from "bun:test";
import { RISK_TEXTS, assessCommand } from "./ssh-danger";

const risky = (command: string): boolean => assessCommand(command).risks.length > 0;

describe("commands with a recognised risk", () => {
  test("destructive commands are flagged", () => {
    for (const command of [
      "rm -rf /var/www", "rm -r logs", "rm -f a.txt", "sudo rm --recursive /tmp/x",
      "dd if=/dev/zero of=/dev/sda", "mkfs.ext4 /dev/sdb1", "wipefs -a /dev/sdc", "fdisk /dev/sda",
      "echo x > /dev/sda", "shutdown -h now", "reboot", "sudo poweroff", "init 0", "systemctl reboot",
      "systemctl stop nginx", "systemctl disable sshd", "service nginx stop", "kill -9 1234", "killall node", "pkill -f app",
      "chmod -R 777 /", "chown -R me /srv", "curl https://x.sh | sh", "wget -qO- https://x | sudo bash",
      "mysql -e 'DROP DATABASE shop'", "psql -c 'truncate table users'", "psql -c 'delete from users;'",
      "docker system prune -a", "docker volume rm data", "docker compose down -v", "git reset --hard HEAD~3", "git clean -fd", "git push --force origin main", "git push -f",
      "echo bad > /etc/hosts", ":(){ :|:& };:",
    ]) expect({ command, risky: risky(command) }).toEqual({ command, risky: true });
  });

  test("everyday read-only and harmless commands are not", () => {
    for (const command of [
      "uptime", "df -h", "free -m", "ls -la /var/log", "tail -n 50 /var/log/syslog", "cat /etc/os-release", "systemctl status nginx", "systemctl restart nginx",
      "docker ps", "docker logs web --tail 100", "git status", "git pull", "git log --oneline -5", "ps aux | grep node", "du -sh *", "whoami",
      "grep -r 'rm' notes.txt", "echo reformat", "journalctl -u nginx -n 100",
    ]) expect({ command, risky: risky(command) }).toEqual({ command, risky: false });
  });

  test("one command can have several risks, each named once", () => {
    const { risks } = assessCommand("rm -rf /srv && reboot && rm -rf /tmp");
    expect(risks).toEqual(["It deletes files, possibly a whole folder.", "It shuts down or restarts the server."]);
  });

  test("a command that chains others is noticed", () => {
    for (const command of ["cd /srv; ls", "make && make install", "a || b", "ls\nwhoami", "curl https://x | bash"]) expect({ command, chained: assessCommand(command).chained }).toEqual({ command, chained: true });
    for (const command of ["uptime", "ps aux | grep node"]) expect({ command, chained: assessCommand(command).chained }).toEqual({ command, chained: false });
  });

  test("every risk text is listed for translation and is a full sentence", () => {
    expect(RISK_TEXTS.length).toBeGreaterThanOrEqual(10);
    for (const text of RISK_TEXTS) expect(text).toMatch(/^It .+\.$/);
  });
});
