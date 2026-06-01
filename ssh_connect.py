import pexpect
import sys

child = pexpect.spawn(
    'ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 root@106.14.155.220',
    timeout=30,
    encoding='utf-8',
    logfile=sys.stdout
)

child.expect('password:', timeout=15)
child.sendline('lsh.20001212')

child.expect('#', timeout=15)
child.sendline('echo CONNECTED_SUCCESS && uname -a && cat /etc/os-release | head -5')

index = child.expect(['CONNECTED_SUCCESS', pexpect.TIMEOUT, pexpect.EOF], timeout=15)
if index == 0:
    print('\n\n=== SSH CONNECTION SUCCESSFUL ===')
    # Read the output after the marker
    child.expect('#', timeout=10)
    print(child.before)
    print('=== END ===')

    # Now install Node.js and coderev
    child.sendline('curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs git')
    child.expect('#', timeout=120)
    print('Node.js installed')
    
    child.sendline('npm install -g @lishihao2749/coderev')
    child.expect('#', timeout=60)
    print('coderev installed')
    
    child.sendline('node --version && npm --version')
    child.expect('#', timeout=10)
    print(child.before)
else:
    print('Failed to connect')
